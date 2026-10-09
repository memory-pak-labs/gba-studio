#!/usr/bin/env python3
import argparse
from collections import Counter, OrderedDict
from contextlib import contextmanager
from contextvars import ContextVar
import hashlib
import json
import math
import unicodedata
import re
import shutil
import struct
import sys
import wave
import zlib
from pathlib import Path


RUNTIME_PROFILE_ALIASES = {
    "topdown": "topdown",
    "top_down": "topdown",
    "adventure_topdown": "topdown",
    "platformer": "platformer",
    "platform": "platformer",
    "isometric": "isometric",
    "iso": "isometric",
    "dungeon_crawler": "dungeon_crawler",
    "dungeonCrawler": "dungeon_crawler",
    "dungeon-crawler": "dungeon_crawler",
    "racing": "racing",
    "race": "racing",
    "corrida": "racing",
    "battle_rpg": "battle_rpg",
    "battleRpg": "battle_rpg",
    "battle-rpg": "battle_rpg",
    "luta": "luta",
    "fight": "luta",
    "fighting": "luta",
    "point_click": "point_click",
    "point_and_click": "point_click",
    "point-and-click": "point_click",
    "pointAndClick": "point_click",
    "shmup": "shmup",
    "shoot_em_up": "shmup",
    "shoot-em-up": "shmup",
    "shootEmUp": "shmup",
    "visual_novel": "visual_novel",
    "visualNovel": "visual_novel",
    "menu": "menu",
    "ui": "menu",
    "cutscene": "cutscene",
    "world_map": "world_map",
    "worldMap": "world_map",
    "mixed": "mixed",
    "multi_runtime": "mixed",
}

EXPORT_PROJECT_BLOCKS = {
    "topdown": ("topdown_project", "topdown", "native"),
    "platformer": ("platformer_project", "platformer", "native"),
    "isometric": ("isometric_project", "isometric", "native"),
    "dungeon_crawler": ("dungeon_crawler_project", "dungeon_crawler", "native"),
    "racing": ("racing_project", "racing", "native"),
    "battle_rpg": ("battle_rpg_project", "battle_rpg", "native"),
    "luta": ("luta_project", "luta", "native"),
    "point_click": ("point_click_project", "point_click", "native"),
    "shmup": ("shmup_project", "shmup", "native"),
    "visual_novel": ("visual_novel_project", "visual_novel", "native"),
    "menu": ("menu_project", "menu", "native"),
    "cutscene": ("cutscene_project", "cutscene", "native"),
    "world_map": ("world_map_project", "world_map", "native"),
    "mixed": ("runtime_dispatch", "mixed", "native"),
}

EMITTED_PALETTE_WARNINGS = set()
PNG_READ_CACHE = {}
BACKGROUND_CACHE_MAX_ENTRIES = 64
BACKGROUND_CACHE_MAX_VALUES = 1048576
BACKGROUND_4BPP_CACHE = ContextVar("assetc_background_4bpp_cache", default=None)
AFFINE_TILE_CACHE = {}
ASSETC_EXPORT_PLAN_SCHEMA = 2
PACK_COMPRESSION_STRATEGIES = ("none", "rle16", "lz77", "huffman")
OBJ_LOOKUP_CACHE_MAX_ENTRIES = 32
OBJ_LOOKUP_CACHE_MAX_KEYS = 32768
OBJ_LOOKUP_CACHE = ContextVar("assetc_obj_lookup_cache", default=None)


@contextmanager
def obj_lookup_cache_scope():
    cache = {"entries": OrderedDict(), "keys": 0}
    token = OBJ_LOOKUP_CACHE.set(cache)
    try:
        yield
    finally:
        cache["entries"].clear()
        OBJ_LOOKUP_CACHE.reset(token)


@contextmanager
def background_cache_scope():
    # Nested report/header generation must share the enclosing export cache.
    if BACKGROUND_4BPP_CACHE.get() is not None:
        yield
        return
    cache = {"entries": OrderedDict(), "values": 0}
    token = BACKGROUND_4BPP_CACHE.set(cache)
    try:
        yield
    finally:
        cache["entries"].clear()
        cache["values"] = 0
        BACKGROUND_4BPP_CACHE.reset(token)


def paeth(a, b, c):
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def gba_rgb(color):
    return tuple((channel >> 3) << 3 for channel in color)


def quantize_color_counts(color_counts, color_limit):
    if color_limit <= 0:
        return []
    colors = list(color_counts.items())
    if len(colors) <= color_limit:
        return [color for color, _count in colors]

    boxes = [colors]
    while len(boxes) < color_limit:
        candidates = []
        for index, box in enumerate(boxes):
            if len(box) < 2:
                continue
            ranges = [max(color[channel] for color, _count in box) - min(color[channel] for color, _count in box) for channel in range(3)]
            axis = max(range(3), key=lambda channel: (ranges[channel], -channel))
            candidates.append((ranges[axis], sum(count for _color, count in box), len(box), -index, axis, index))
        if not candidates:
            break

        _range, _weight, _size, _order, axis, box_index = max(candidates)
        box = sorted(boxes.pop(box_index), key=lambda item: (item[0][axis], item[0]))
        total = sum(count for _color, count in box)
        running = 0
        split_at = 1
        for split_at, (_color, count) in enumerate(box, start=1):
            running += count
            if running * 2 >= total:
                break
        split_at = min(max(1, split_at), len(box) - 1)
        boxes.extend((box[:split_at], box[split_at:]))

    palette = []
    for box in boxes:
        total = sum(count for _color, count in box)
        average = tuple(sum(color[channel] * count for color, count in box) // total for channel in range(3))
        palette.append(gba_rgb(average))
    return palette


def nearest_palette_index(color, palette, cache=None):
    cache_key = None
    if cache is not None:
        cache_key = (tuple(palette), color)
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
    visible_indexes = [index for index, candidate in enumerate(palette) if candidate is not None]
    if not visible_indexes:
        raise SystemExit("paleta de background nao possui cor visivel para o tile")
    result = min(
        visible_indexes,
        key=lambda index: (
            2 * ((color[0] - palette[index][0]) ** 2)
            + 4 * ((color[1] - palette[index][1]) ** 2)
            + ((color[2] - palette[index][2]) ** 2),
            index,
        ),
    )
    if cache is not None:
        cache[cache_key] = result
    return result


def weighted_color_distance(color, candidate):
    return (
        2 * ((color[0] - candidate[0]) ** 2)
        + 4 * ((color[1] - candidate[1]) ** 2)
        + ((color[2] - candidate[2]) ** 2)
    )


def palette_mapping_error(color_counts, palette, nearest_cache=None):
    if not color_counts:
        return 0
    if not any(color is not None for color in palette):
        return float("inf")
    return sum(
        count * weighted_color_distance(color, palette[nearest_palette_index(color, palette, nearest_cache)])
        for color, count in color_counts.items()
    )


def background_tile_infos(width, height, colors, indices, transparent_index=None):
    if width % 8 != 0 or height % 8 != 0:
        raise SystemExit("largura e altura precisam ser multiplos de 8")

    hardware_colors = [gba_rgb(color) for color in colors]
    infos = []
    for tile_y in range(0, height, 8):
        for tile_x in range(0, width, 8):
            source_colors = []
            source_positions = []
            counts = Counter()
            has_transparency = False
            for y in range(8):
                for x in range(8):
                    position = (tile_y + y) * width + tile_x + x
                    if indices[position] == transparent_index:
                        color = None
                        has_transparency = True
                    else:
                        color = hardware_colors[indices[position]]
                    source_colors.append(color)
                    source_positions.append(position)
                    if color is not None:
                        counts[color] += 1
            # Text/tiled BGs treat local palette index 0 as transparent even
            # when the source plane itself is opaque. Reserve it for every
            # tile so exported tilemaps cannot create holes in the runtime.
            visible_limit = 15
            local_palette = list(counts.keys())
            if len(local_palette) > visible_limit:
                local_palette = quantize_color_counts(counts, visible_limit)
            local_palette.insert(0, None)
            infos.append({
                "counts": counts,
                "local_palette": local_palette,
                "positions": source_positions,
                "source_colors": source_colors,
                "has_transparency": has_transparency,
            })
    return infos


def assign_strict_background_banks(tile_infos, max_palette_banks):
    banks = []
    assignments = []
    for info in tile_infos:
        local_palette = info["local_palette"]
        candidates = []
        for bank_index, bank in enumerate(banks):
            additions = [color for color in local_palette if color not in bank]
            if len(bank) + len(additions) <= 16:
                candidates.append((len(additions), len(bank), bank_index, additions))
        if candidates:
            _added_count, _bank_size, bank_index, additions = min(candidates)
            banks[bank_index].extend(additions)
        else:
            if len(banks) >= max_palette_banks:
                return None
            bank_index = len(banks)
            banks.append(list(local_palette))
        assignments.append(bank_index)
    return banks, assignments


def constrained_background_banks(tile_infos, max_palette_banks):
    if not tile_infos:
        return [], []

    tile_count = len(tile_infos)
    bank_count = min(max_palette_banks, tile_count)
    first_seed = min(
        range(tile_count),
        key=lambda index: (-sum(tile_infos[index]["counts"].values()), index),
    )
    seed_indices = [first_seed]
    selected_lookup = {first_seed}
    minimum_errors = [float("inf")] * tile_count
    nearest_cache = {}

    def update_minimum_errors(seed_index):
        seed_palette = tile_infos[seed_index]["local_palette"]
        for index, info in enumerate(tile_infos):
            if index in selected_lookup:
                continue
            error = palette_mapping_error(info["counts"], seed_palette, nearest_cache)
            if error < minimum_errors[index]:
                minimum_errors[index] = error

    update_minimum_errors(first_seed)
    while len(seed_indices) < bank_count:
        next_seed = max(
            (index for index in range(tile_count) if index not in selected_lookup),
            key=lambda index: (minimum_errors[index], -index),
        )
        seed_indices.append(next_seed)
        selected_lookup.add(next_seed)
        update_minimum_errors(next_seed)

    banks = [list(tile_infos[index]["local_palette"]) for index in seed_indices]
    assignments = [0] * tile_count
    for _ in range(3):
        groups = [Counter() for _ in banks]
        transparent_groups = [False for _ in banks]
        for tile_index, info in enumerate(tile_infos):
            bank_index = min(
                range(len(banks)),
                key=lambda index: (palette_mapping_error(info["counts"], banks[index], nearest_cache), index),
            )
            assignments[tile_index] = bank_index
            groups[bank_index].update(info["counts"])
            transparent_groups[bank_index] = transparent_groups[bank_index] or info["has_transparency"]
        banks = [
            ([None] + quantize_color_counts(group, 15))
            if group else bank
            for bank, group, transparent in zip(banks, groups, transparent_groups)
        ]
    return banks, assignments


def _plan_4bpp_background(
    width,
    height,
    colors,
    indices,
    max_palette_banks=16,
    transparent_index=None,
    reference_plan=None,
):
    if max_palette_banks < 1 or max_palette_banks > 16:
        raise SystemExit("preparacao de background 4bpp aceita entre 1 e 16 bancos")

    tile_infos = background_tile_infos(width, height, colors, indices, transparent_index)
    if reference_plan is not None:
        raw_colors = reference_plan.get("colors")
        if isinstance(raw_colors, list):
            if not raw_colors or len(raw_colors) > 16:
                raise SystemExit("referencia de paleta de background possui entre 1 e 16 cores")
            banks = []
            normalized_bank = []
            for color in raw_colors:
                if not isinstance(color, (list, tuple)) or len(color) != 3:
                    raise SystemExit("referencia de paleta de background possui cor invalida")
                normalized_bank.append(tuple(int(channel) for channel in color))
            banks.append(normalized_bank)
            assignments = [0] * len(tile_infos)
            strategy = "inline-reference"
        else:
            raw_banks = reference_plan.get("banks")
            raw_assignments = reference_plan.get("tile_palette_banks")
            if not isinstance(raw_banks, list) or not isinstance(raw_assignments, list):
                raise SystemExit("referencia de paleta de background invalida")
            if len(raw_assignments) != len(tile_infos) or len(raw_banks) > max_palette_banks:
                raise SystemExit("referencia de paleta de background possui geometria incompatível")
            banks = []
            for bank in raw_banks:
                if not isinstance(bank, list):
                    raise SystemExit("referencia de paleta de background possui banco invalido")
                normalized_bank = []
                for color in bank:
                    if color is None:
                        normalized_bank.append(None)
                    elif isinstance(color, (list, tuple)) and len(color) == 3:
                        normalized_bank.append(tuple(int(channel) for channel in color))
                    else:
                        raise SystemExit("referencia de paleta de background possui cor invalida")
                if len(normalized_bank) > 16:
                    raise SystemExit("referencia de paleta de background possui banco maior que 16 cores")
                banks.append(normalized_bank)
            assignments = [int(assignment) for assignment in raw_assignments]
            if any(assignment < 0 or assignment >= len(banks) for assignment in assignments):
                raise SystemExit("referencia de paleta de background aponta para banco inexistente")
            strategy = "shared-reference"
    else:
        strict = assign_strict_background_banks(tile_infos, max_palette_banks)
        if strict is None:
            banks, assignments = constrained_background_banks(tile_infos, max_palette_banks)
            strategy = "constrained"
        else:
            banks, assignments = strict
            strategy = "strict"

    return tile_infos, banks, assignments, strategy


def prepare_4bpp_background(
    width,
    height,
    colors,
    indices,
    max_palette_banks=16,
    transparent_index=None,
    reference_plan=None,
):
    tile_infos, banks, assignments, strategy = _plan_4bpp_background(
        width,
        height,
        colors,
        indices,
        max_palette_banks=max_palette_banks,
        transparent_index=transparent_index,
        reference_plan=reference_plan,
    )
    prepared_pixels = [(0, 0, 0, 255)] * (width * height)
    total_error = 0
    tile_errors = []
    nearest_cache = {}
    for info, bank_index in zip(tile_infos, assignments):
        bank = banks[bank_index]
        tile_error = palette_mapping_error(info["counts"], bank, nearest_cache)
        tile_errors.append(tile_error)
        total_error += tile_error
        for position, color in zip(info["positions"], info["source_colors"]):
            if color is None:
                prepared_pixels[position] = (0, 0, 0, 0)
            else:
                prepared = bank[nearest_palette_index(color, bank, nearest_cache)]
                prepared_pixels[position] = (*prepared, 255)

    source_color_count = len({gba_rgb(colors[index]) for index in indices if index != transparent_index})
    prepared_color_count = len({pixel[:3] for pixel in prepared_pixels if pixel[3] != 0})
    return {
        "bank_count": len(banks),
        "banks": banks,
        "prepared_color_count": prepared_color_count,
        "prepared_pixels": prepared_pixels,
        "requires_visual_review": total_error > 0,
        "source_color_count": source_color_count,
        "strategy": strategy,
        "tile_color_counts": [len(info["counts"]) for info in tile_infos],
        "tile_errors": tile_errors,
        "tile_palette_banks": assignments,
        "total_color_error": total_error,
    }


def background_preparation_report(width, height, plan):
    return {
        "schema_version": 1,
        "runtime_bpp": 4,
        "width": width,
        "height": height,
        "tile_count": len(plan["tile_palette_banks"]),
        "bank_count": plan["bank_count"],
        "banks": plan["banks"],
        "tile_palette_banks": plan["tile_palette_banks"],
        "tile_color_counts": plan["tile_color_counts"],
        "tile_errors": plan["tile_errors"],
        "source_color_count": plan["source_color_count"],
        "prepared_color_count": plan["prepared_color_count"],
        "strategy": plan["strategy"],
        "total_color_error": plan["total_color_error"],
        "requires_visual_review": plan["requires_visual_review"],
        "status": "attention" if plan["requires_visual_review"] else "safe",
    }


def rgba_rows_to_palette(path, rows, max_colors):
    pixels = []
    opaque_colors = []
    has_transparency = False
    original_colors = set()
    for row in rows:
        for x in range(0, len(row), 4):
            rgba = tuple(row[x:x + 4])
            if rgba[3] == 0:
                pixels.append(None)
                has_transparency = True
                original_colors.add(None)
            else:
                rgb = rgba[:3]
                pixels.append(rgb)
                opaque_colors.append(rgb)
                original_colors.add(rgb)

    if max_colors is None or len(original_colors) <= max_colors:
        colors = []
        color_to_index = {}
        if has_transparency:
            colors.append((0, 0, 0))
        for color in opaque_colors:
            if color not in color_to_index:
                color_to_index[color] = len(colors)
                colors.append(color)
        indices = [0 if color is None else color_to_index[color] for color in pixels]
        return colors, indices

    opaque_limit = max_colors - (1 if has_transparency else 0)
    if opaque_limit <= 0 and opaque_colors:
        raise SystemExit(f"{path}: a transparencia nao deixa espaco para cores visiveis na paleta")

    hardware_colors = [gba_rgb(color) for color in opaque_colors]
    quantized = quantize_color_counts(Counter(hardware_colors), opaque_limit)
    colors = ([(0, 0, 0)] if has_transparency else []) + quantized
    palette_offset = 1 if has_transparency else 0
    # The palette is fixed for this conversion. Repeated hardware colors must
    # select the same index, including the original lowest-index tie break.
    color_indices = {}
    indices = []
    for color in pixels:
        if color is None:
            indices.append(0)
        else:
            hardware_color = gba_rgb(color)
            index = color_indices.get(hardware_color)
            if index is None:
                index = nearest_palette_index(hardware_color, quantized)
                color_indices[hardware_color] = index
            indices.append(palette_offset + index)

    warning_key = (str(Path(path).resolve()), len(original_colors), len(colors))
    if warning_key not in EMITTED_PALETTE_WARNINGS:
        EMITTED_PALETTE_WARNINGS.add(warning_key)
        print(
            f"AVISO[palette_quantized]: {Path(path).name}: paleta RGBA reduzida automaticamente "
            f"de {len(original_colors)} para {len(colors)} cores compativeis com o GBA.",
            file=sys.stderr,
        )
    return colors, indices


def read_png(path, max_colors=16, include_transparency=False, _source_bytes=None):
    path = Path(path)
    data = path.read_bytes() if _source_bytes is None else _source_bytes
    cache_key = (
        str(path.resolve()),
        hashlib.sha256(data).digest(),
        max_colors,
        include_transparency,
    )
    cached = PNG_READ_CACHE.get(cache_key)
    if cached is not None:
        return cached
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise SystemExit(f"{path}: nao e PNG")

    offset = 8
    width = height = bit_depth = color_type = None
    palette = []
    chunks = []
    indexed_transparency = None

    while offset < len(data):
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + length]
        offset += 12 + length

        if kind == b"IHDR":
            width, height, bit_depth, color_type, compression, filter_method, interlace = struct.unpack(">IIBBBBB", payload)
            if compression != 0 or filter_method != 0 or interlace != 0:
                raise SystemExit("PNG precisa ser nao entrelacado, compressao/filter padrao")
        elif kind == b"PLTE":
            palette = [tuple(payload[i:i + 3]) for i in range(0, len(payload), 3)]
        elif kind == b"tRNS":
            indexed_transparency = list(payload)
        elif kind == b"IDAT":
            chunks.append(payload)
        elif kind == b"IEND":
            break

    if color_type == 3 and bit_depth not in (1, 2, 4, 8):
        raise SystemExit("assetc aceita PNG indexed de 1, 2, 4 ou 8 bpp, ou RGBA 8-bit")
    if color_type == 6 and bit_depth != 8:
        raise SystemExit("assetc aceita PNG indexed de 1, 2, 4 ou 8 bpp, ou RGBA 8-bit")
    if color_type not in (3, 6):
        raise SystemExit("assetc aceita PNG indexed de 1, 2, 4 ou 8 bpp, ou RGBA 8-bit")

    raw = zlib.decompress(b"".join(chunks))
    indexed = color_type == 3
    channels = 1 if indexed else 4
    filter_bytes_per_pixel = channels
    stride = ((width * bit_depth + 7) // 8) if indexed else width * channels
    rows = []
    previous = [0] * stride
    pos = 0

    for _ in range(height):
        filter_type = raw[pos]
        pos += 1
        row = list(raw[pos:pos + stride])
        pos += stride
        if filter_type in (0, 2) and len(row) == stride:
            recon = row if filter_type == 0 else [(value + up) & 255 for value, up in zip(row, previous)]
            rows.append(recon)
            previous = recon
            continue
        recon = [0] * stride
        for i, value in enumerate(row):
            left = recon[i - filter_bytes_per_pixel] if i >= filter_bytes_per_pixel else 0
            up = previous[i]
            up_left = previous[i - filter_bytes_per_pixel] if i >= filter_bytes_per_pixel else 0
            if filter_type == 0:
                recon[i] = value
            elif filter_type == 1:
                recon[i] = (value + left) & 255
            elif filter_type == 2:
                recon[i] = (value + up) & 255
            elif filter_type == 3:
                recon[i] = (value + ((left + up) // 2)) & 255
            elif filter_type == 4:
                recon[i] = (value + paeth(left, up, up_left)) & 255
            else:
                raise SystemExit(f"Filtro PNG nao suportado: {filter_type}")
        rows.append(recon)
        previous = recon

    indices = []
    colors = []
    transparent_index = None

    if color_type == 3:
        colors = list(palette) if max_colors is None else palette[:max_colors]
        for row in rows:
            if bit_depth == 8:
                unpacked = row[:width]
            else:
                values_per_byte = 8 // bit_depth
                mask = (1 << bit_depth) - 1
                unpacked = [
                    (row[x // values_per_byte] >> (8 - bit_depth * ((x % values_per_byte) + 1))) & mask
                    for x in range(width)
                ]
            for value in unpacked:
                if value >= len(colors):
                    raise SystemExit(f"PNG indexed usa indice de cor {value}, mas o limite atual e {max_colors} cores")
            indices.extend(unpacked)
        if indexed_transparency is not None:
            transparent_indices = [index for index, alpha in enumerate(indexed_transparency) if alpha == 0]
            if len(transparent_indices) == 1:
                transparent_index = transparent_indices[0]
    else:
        colors, indices = rgba_rows_to_palette(path, rows, max_colors)
        if any(row[index] == 0 for row in rows for index in range(3, len(row), 4)):
            transparent_index = 0

    if max_colors is not None and len(colors) > max_colors:
        raise SystemExit(f"PNG indexed tem mais de {max_colors} cores")

    result = (
        (width, height, colors, indices, transparent_index)
        if include_transparency
        else (width, height, colors, indices)
    )
    PNG_READ_CACHE[cache_key] = result
    return result


def write_rgba_png(path, width, height, pixels):
    if len(pixels) != width * height:
        raise SystemExit("PNG preparado possui quantidade invalida de pixels")
    rows = []
    for y in range(height):
        row = bytearray()
        for x in range(width):
            red, green, blue, alpha = pixels[(y * width) + x]
            row.extend((red, green, blue, alpha))
        rows.append(b"\x00" + bytes(row))

    def chunk(kind, payload):
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    data = b"\x89PNG\r\n\x1a\n"
    data += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(b"".join(rows)))
    data += chunk(b"IEND", b"")
    Path(path).write_bytes(data)


def normalize_obj_transparency(colors, indices, transparent_color_index):
    if transparent_color_index is None or not indices:
        return colors, indices
    if transparent_color_index == "top_left":
        transparent_color_index = indices[0]
    if not isinstance(transparent_color_index, int):
        raise SystemExit("transparent_color_index precisa ser inteiro ou top_left")
    if transparent_color_index < 0 or transparent_color_index >= len(colors):
        raise SystemExit("transparent_color_index referencia uma cor ausente da paleta OBJ")
    if transparent_color_index == 0:
        return colors, indices

    normalized_colors = list(colors)
    normalized_colors[0], normalized_colors[transparent_color_index] = (
        normalized_colors[transparent_color_index],
        normalized_colors[0],
    )
    normalized_indices = [
        transparent_color_index if index == 0 else 0 if index == transparent_color_index else index
        for index in indices
    ]
    return normalized_colors, normalized_indices


def prepare_obj_asset_pixels(colors, indices, transparent_index, asset):
    sprite_bpp = int(asset.get("sprite_bpp", 4))
    if sprite_bpp not in (4, 8):
        raise SystemExit(f"{asset.get('name', 'asset')}: sprite_bpp suporta somente 4 ou 8")
    normalized_colors, normalized_indices = normalize_obj_transparency(
        colors,
        indices,
        asset.get("transparent_color_index"),
    )
    if sprite_bpp == 8:
        # Keep every RGB555 color exactly, even when the source contains many
        # RGB888 variants of the same hardware color. Index zero stays alpha.
        zero_is_transparent = transparent_index is not None or asset.get("transparent_color_index") is not None
        hardware_palette = [(0, 0, 0)]
        hardware_indices = {}
        remapped = []
        for index in normalized_indices:
            if index == 0 and zero_is_transparent:
                remapped.append(0)
                continue
            color = rgb15(normalized_colors[index])
            if color not in hardware_indices:
                hardware_indices[color] = len(hardware_palette)
                hardware_palette.append(rgb15_to_rgb888(color))
            remapped.append(hardware_indices[color])
        normalized_colors, normalized_indices = hardware_palette, remapped
    reserve_transparency = asset.get("reserve_obj_transparent_color") or (
        transparent_index is None and asset.get("transparent_color_index") is None
    )
    if reserve_transparency and transparent_index is None and 0 in normalized_indices:
        visible_color_limit = 15 if sprite_bpp == 4 else 255
        if len(normalized_colors) > visible_color_limit:
            raise SystemExit(
                f"{asset.get('name', 'asset')}: OBJ opaco precisa reservar uma cor para transparencia;"
                f" a paleta tem mais de {visible_color_limit} cores visiveis"
            )
        normalized_colors = [(0, 0, 0), *normalized_colors]
        normalized_indices = [index + 1 for index in normalized_indices]
    override = asset.get("object_palette_values")
    if override is not None:
        palette_limit = 16 if sprite_bpp == 4 else 256
        if not isinstance(override, list) or not override or len(override) > palette_limit:
            raise SystemExit(
                f"{asset.get('name', 'asset')}: object_palette_values precisa ter entre 1 e {palette_limit} cores"
            )
        target = [rgb15_to_rgb888(require_int(value, "object_palette_values[]", 0, 0x7FFF)) for value in override]
        target.extend([(0, 0, 0)] * (palette_limit - len(target)))
        remapped_indices = []
        visible_target = target[1:]
        nearest_cache = {}
        for index in normalized_indices:
            if index == 0:
                remapped_indices.append(0)
                continue
            source_color = normalized_colors[index] if index < len(normalized_colors) else (0, 0, 0)
            remapped_indices.append(nearest_palette_index(source_color, visible_target, nearest_cache) + 1)
        normalized_colors, normalized_indices = target, remapped_indices
    if asset.get("object_palette_plan") is not None:
        return apply_obj_palette_plan(normalized_colors, normalized_indices, asset["object_palette_plan"])
    return normalized_colors, normalized_indices



# OBJ banks 13-15 belong to runtime text/UI. Mixed 4/8bpp scenes upload only
# entries 0-207 so an asset load never replaces a dialogue/name-input palette.
OBJ_MASTER_PALETTE_COLORS = 208
OBJ_BUILTIN_PALETTE_BANK = 12
OBJ_BUILTIN_PALETTE_VALUES = [0, 6 | (20 << 5) | (31 << 10), 31 | (7 << 5) | (5 << 10), 0x7FFF] + [0] * 12


def plan_pack_obj_palettes(assets, base_dir):
    """Exact scene masters. Shared 4bpp sprites keep fixed banks across scenes."""
    result = [dict(asset) if isinstance(asset, dict) else asset for asset in assets]
    objects = [a for a in result if isinstance(a, dict) and a.get("kind") == "obj" and a.get("png")]
    eight = [a for a in objects if int(a.get("sprite_bpp", 4)) == 8]
    if not eight:
        return result

    def scopes(a):
        return set(pack_asset_bank_groups(a, pack_asset_bank_group(a)))

    def overlaps(left, right):
        return "global" in left or "global" in right or bool(left.intersection(right))

    all_eight_groups = set().union(*(scopes(a) for a in eight))
    four = [a for a in objects if int(a.get("sprite_bpp", 4)) == 4 and overlaps(scopes(a), all_eight_groups)]
    visible = {}
    for a in [*four, *eight]:
        bpp = int(a.get("sprite_bpp", 4))
        _, _, colors, indices, transparent = read_png(base_dir / a["png"], max_colors=None if bpp == 8 else 16, include_transparency=True)
        colors, indices = prepare_obj_asset_pixels(colors, indices, transparent, a)
        visible[id(a)] = list(dict.fromkeys(rgb15(colors[i]) for i in indices if i != 0))

    # Reindex compatible icons into the same 4bpp bank, without losing a color.
    # Their bank is fixed even when an icon/effect is shared by different scenes.
    bins = []
    assignments = {}
    for a in sorted(four, key=lambda a: -len(visible[id(a)])):
        colors = visible[id(a)]
        choices = [(len(set(colors) - set(bank)), index) for index, bank in enumerate(bins)
                   if len(set(colors).union(bank)) <= 15]
        if choices:
            _, bank_index = min(choices)
        else:
            bank_index = len(bins)
            if bank_index >= OBJ_BUILTIN_PALETTE_BANK:
                raise SystemExit("paleta OBJ compartilhada: mais de 12 bancos 4bpp; banco 12 reservado ao fallback do motor e bancos 13-15 ao texto/UI")
            bins.append([])
        bins[bank_index].extend(color for color in colors if color not in bins[bank_index])
        assignments[id(a)] = bank_index
    for a in four:
        bank = assignments[id(a)]
        values = [0, *bins[bank]] + [0] * (15 - len(bins[bank]))
        a["object_palette_plan"] = {"values": values, "palette_bank": bank, "groups": sorted(scopes(a).union(all_eight_groups))}

    # A shared 4bpp palette does not join the color budgets of disjoint scenes.
    # Only an 8bpp sheet used in multiple scenes needs one master across them.
    pending = list(eight)
    while pending:
        component = [pending.pop(0)]
        groups = scopes(component[0])
        changed = True
        while changed:
            changed = False
            for candidate in pending[:]:
                if overlaps(groups, scopes(candidate)):
                    component.append(candidate)
                    pending.remove(candidate)
                    groups.update(scopes(candidate))
                    changed = True
        master = [0] * OBJ_MASTER_PALETTE_COLORS
        builtin_start = OBJ_BUILTIN_PALETTE_BANK * 16
        master[builtin_start:builtin_start + 16] = OBJ_BUILTIN_PALETTE_VALUES
        occupied = {0, *range(builtin_start, builtin_start + 16)}
        first_index = {}
        for bank, colors in enumerate(bins):
            master[bank * 16:bank * 16 + 16] = [0, *colors] + [0] * (15 - len(colors))
            occupied.update(range(bank * 16, bank * 16 + 16))
            for index, color in enumerate(colors, 1):
                first_index.setdefault(color, bank * 16 + index)
        for index, color in enumerate(OBJ_BUILTIN_PALETTE_VALUES[1:4], 1):
            first_index.setdefault(color, builtin_start + index)
        for a in component:
            for color in visible[id(a)]:
                if color in first_index:
                    continue
                free = next((i for i in range(1, OBJ_MASTER_PALETTE_COLORS) if i not in occupied), None)
                if free is None:
                    raise SystemExit("paleta OBJ compartilhada excede o orcamento de ate 207 cores/slots; sprites 4bpp compartilham esse limite, banco 12 e reservado ao fallback do motor e bancos 13-15 ao texto/UI. Divida as cenas ou revise as paletas; nenhuma cor foi reduzida")
                master[free] = color
                occupied.add(free)
                first_index[color] = free
        for a in component:
            a["object_palette_plan"] = {"values": master, "palette_bank": 0, "groups": sorted(groups), "indices": first_index, "shared_bank_colors": len(bins) * 16}
    return result


def reserve_pack_obj_palette_plans(assets, pools, group_pools):
    planned = [a for a in assets if isinstance(a, dict) and "object_palette_plan" in a]
    for a in planned:
        for group in a["object_palette_plan"]["groups"]:
            if group != "global" and group not in group_pools:
                group_pools[group] = {resource: list(pool) for resource, pool in pools.items()}
    # Globals are reserved before scoped masters so new pools inherit their banks.
    for a in sorted(planned, key=lambda a: "global" not in a["object_palette_plan"]["groups"]):
        plan = a["object_palette_plan"]
        selected = [pools, *group_pools.values()] if "global" in plan["groups"] else [group_pools[g] for g in plan["groups"]]
        start = plan["palette_bank"] * 16
        for pool in selected:
            pool["obj_palette_colors"][start:start + len(plan["values"])] = [True] * len(plan["values"])
            if int(a.get("sprite_bpp", 4)) == 8:
                # Other palette resources must not escape into private UI banks.
                pool["obj_palette_colors"][OBJ_MASTER_PALETTE_COLORS:] = [True] * (len(pool["obj_palette_colors"]) - OBJ_MASTER_PALETTE_COLORS)
                # Three 4bpp fallback tiles before the private text arena.
                pool["obj_tiles"][897:] = [True] * (len(pool["obj_tiles"]) - 897)


def apply_obj_palette_plan(colors, indices, plan):
    values = plan["values"]
    target = [rgb15_to_rgb888(value) for value in values]
    lookup = {rgb15(color): index for index, color in reversed(list(enumerate(target))) if index != 0}
    if "indices" in plan:
        lookup = {int(color): index for color, index in plan["indices"].items()}
    return target, [0 if index == 0 else lookup[rgb15(colors[index])] for index in indices]


def inline_palette_values(asset):
    values = asset.get("palette_values")
    if not isinstance(values, list) or not values or len(values) > 16:
        raise SystemExit(f"{asset.get('name', 'palette')}: palette_values precisa ter entre 1 e 16 cores")
    normalized = []
    for value in values:
        normalized.append(require_int(value, "palette_values[]", 0, 0x7FFF))
    return normalized


def inline_palette_resource(asset):
    slot = asset.get("palette_slot")
    if slot == "background":
        return "bg_palette_colors"
    if slot == "objects":
        return "obj_palette_colors"
    raise SystemExit(f"{asset.get('name', 'palette')}: palette_slot precisa ser background ou objects")


def rgb15_to_rgb888(value):
    return ((value & 0x1F) << 3, ((value >> 5) & 0x1F) << 3, ((value >> 10) & 0x1F) << 3)


def rgb15(color):
    r, g, b = color
    return (r >> 3) | ((g >> 3) << 5) | ((b >> 3) << 10)


def pack_tile(width, indices, tile_x, tile_y):
    packed = []
    for y in range(8):
        for x in range(0, 8, 2):
            a = indices[(tile_y + y) * width + tile_x + x] & 15
            b = indices[(tile_y + y) * width + tile_x + x + 1] & 15
            packed.append(a | (b << 4))
    return packed


def build_tiles(width, height, indices):
    if width % 8 != 0 or height % 8 != 0:
        raise SystemExit("largura e altura precisam ser multiplos de 8")

    tilemap_width = width // 8
    tilemap_height = height // 8
    tiles = []
    tile_lookup = {}
    tilemap_entries = []

    for tile_y in range(0, height, 8):
        for tile_x in range(0, width, 8):
            packed = pack_tile(width, indices, tile_x, tile_y)
            tile_key = tuple(packed)
            if tile_key not in tile_lookup:
                tile_lookup[tile_key] = len(tiles)
                tiles.append(packed)
            tilemap_entries.append(tile_lookup[tile_key])

    return tiles, tilemap_entries, tilemap_width, tilemap_height


def packed_tile_indices(tile_key):
    return tuple(
        index
        for packed in tile_key
        for index in (packed & 0x0F, (packed >> 4) & 0x0F)
    )


def tile_pattern_error(left, right, palette):
    error = 0
    for left_index, right_index in zip(packed_tile_indices(left), packed_tile_indices(right)):
        left_color = palette[left_index]
        right_color = palette[right_index]
        if left_color is None and right_color is None:
            continue
        if left_color is None or right_color is None:
            error += 1_000_000
            continue
        error += weighted_color_distance(left_color, right_color)
    return error


def resolved_tile_key(remaps, bank_index, tile_key):
    visited = set()
    current = tile_key
    while (bank_index, current) in remaps:
        if current in visited:
            raise SystemExit("otimizacao de tiles criou um ciclo de remapeamento")
        visited.add(current)
        current = remaps[(bank_index, current)]
    # Comprima o caminho para que a contagem de tiles finais nao percorra a
    # mesma cadeia repetidamente durante a reducao de backgrounds grandes.
    for previous in visited:
        remaps[(bank_index, previous)] = current
    return current


def build_tile_pattern_error_lookup(tile_keys, palette):
    # Store each local palette index in a byte. OR-ing the left indexes with
    # the right indexes shifted four bits gives 64 indexes into a 16x16 table.
    # bytes.translate() and sum(bytes) perform the same pixel lookup in native
    # Python operations, avoiding a Python generator for every candidate pair.
    patterns = {}
    for key in tile_keys:
        indexes = packed_tile_indices(key)
        if any(index >= len(palette) for index in indexes):
            raise IndexError("tile index outside its palette")
        patterns[key] = int.from_bytes(bytes(indexes), "little")
    distances = [0] * 256
    for left_index, left_color in enumerate(palette):
        for right_index, right_color in enumerate(palette):
            if left_color is not None and right_color is not None:
                distances[left_index | (right_index << 4)] = weighted_color_distance(left_color, right_color)
    byte_count = max(1, (max(distances).bit_length() + 7) // 8)
    tables = [bytes((value >> (8 * byte)) & 255 for value in distances) for byte in range(byte_count)]

    def error(left_key, right_key):
        pairs = (patterns[left_key] | (patterns[right_key] << 4)).to_bytes(64, "little")
        # Sum each byte of the distance independently to preserve exact integer
        # totals, including distances greater than 255. Transparent pairs keep
        # the existing zero error; ordering and tie breaks remain unchanged.
        total = 0
        for byte, table in enumerate(tables):
            total += sum(pairs.translate(table)) << (8 * byte)
        return total

    return error


def reduce_background_tile_patterns_by_bank(occurrences, banks, tile_budget):
    if tile_budget < 1 or tile_budget > 1024:
        raise SystemExit("orcamento de tiles de background precisa estar entre 1 e 1024")

    patterns_by_bank = {}
    pattern_order = {}
    for order, (bank_index, tile_key, _flip_flags) in enumerate(occurrences):
        bank_patterns = patterns_by_bank.setdefault(bank_index, {})
        entry = bank_patterns.setdefault(tile_key, {"count": 0, "order": order})
        entry["count"] += 1
        pattern_order.setdefault(tile_key, order)

    before = len({tile_key for _bank_index, tile_key, _flip_flags in occurrences})
    if before <= tile_budget:
        return {}, {
            "tile_budget": tile_budget,
            "tile_count_before": before,
            "tile_count_after": before,
            "merged_tile_count": 0,
            "total_mapping_error": 0,
        }

    error_lookups = {
        bank_index: build_tile_pattern_error_lookup(entries, banks[bank_index])
        for bank_index, entries in patterns_by_bank.items()
    }

    def fast_tile_pattern_error(left_key, right_key, bank_index):
        return error_lookups[bank_index](left_key, right_key)

    candidates = []
    for bank_index, entries in patterns_by_bank.items():
        ordered_keys = sorted(entries, key=lambda key: entries[key]["order"])
        for left_index, left_key in enumerate(ordered_keys):
            for right_key in ordered_keys[left_index + 1:]:
                left_entry = entries[left_key]
                right_entry = entries[right_key]
                if (left_entry["count"], -left_entry["order"]) <= (right_entry["count"], -right_entry["order"]):
                    source_key, target_key = left_key, right_key
                else:
                    source_key, target_key = right_key, left_key
                error = fast_tile_pattern_error(source_key, target_key, bank_index)
                candidates.append((
                    error * entries[source_key]["count"],
                    error,
                    bank_index,
                    entries[source_key]["order"],
                    entries[target_key]["order"],
                    source_key,
                    target_key,
                ))
    candidates.sort()

    active = {
        bank_index: set(entries)
        for bank_index, entries in patterns_by_bank.items()
    }
    remaps = {}
    total_error = 0
    merged_tile_count = 0

    def final_tile_count():
        return len({
            resolved_tile_key(remaps, bank_index, tile_key)
            for bank_index, entries in patterns_by_bank.items()
            for tile_key in entries
        })

    current_count = before
    for weighted_error, error, bank_index, _source_order, _target_order, source_key, target_key in candidates:
        if current_count <= tile_budget:
            break
        if source_key not in active[bank_index] or target_key not in active[bank_index]:
            continue
        active[bank_index].remove(source_key)
        remaps[(bank_index, source_key)] = target_key
        total_error += weighted_error
        merged_tile_count += 1
        current_count = final_tile_count()

    if current_count > tile_budget:
        raise SystemExit(f"background regular nao pode atingir o orcamento solicitado de {tile_budget} tiles")

    # Greedy merges can form A -> B -> C chains. C is not necessarily the
    # closest surviving pattern to A, producing avoidable patches in roofs,
    # terrain and silhouettes. Reassign from the ORIGINAL pattern to the
    # nearest retained representative in its palette bank, without adding tiles.
    refined_remaps = {}
    total_error = 0
    for bank_index, entries in patterns_by_bank.items():
        survivors = sorted(active[bank_index], key=lambda key: entries[key]["order"])
        for tile_key, entry in entries.items():
            if tile_key in active[bank_index]:
                continue
            target = min(survivors, key=lambda key: fast_tile_pattern_error(tile_key, key, bank_index))
            refined_remaps[(bank_index, tile_key)] = target
            total_error += fast_tile_pattern_error(tile_key, target, bank_index) * entry["count"]
    remaps = refined_remaps
    current_count = final_tile_count()

    return remaps, {
        "tile_budget": tile_budget,
        "tile_count_before": before,
        "tile_count_after": current_count,
        "merged_tile_count": merged_tile_count,
        "total_mapping_error": total_error,
    }


def build_4bpp_background(
    width,
    height,
    colors,
    indices,
    transparent_index=None,
    optimize_tile_budget=None,
    return_optimization=False,
    max_palette_banks=16,
    reference_plan=None,
):
    tile_infos, banks, assignments, _strategy = _plan_4bpp_background(
        width,
        height,
        colors,
        indices,
        max_palette_banks=max_palette_banks,
        transparent_index=transparent_index,
        reference_plan=reference_plan,
    )
    tilemap_width = width // 8
    tilemap_height = height // 8
    tiles = []
    tile_lookup = {}
    occurrences = []
    nearest_cache = {}

    for info, bank_index in zip(tile_infos, assignments):
        bank = banks[bank_index]
        local_indices = [0 if color is None else nearest_palette_index(color, bank, nearest_cache) for color in info["source_colors"]]
        variants = []
        for hflip, vflip, flags in (
            (False, False, 0),
            (True, False, 1 << 10),
            (False, True, 1 << 11),
            (True, True, (1 << 10) | (1 << 11)),
        ):
            transformed = []
            for y in range(8):
                source_y = 7 - y if vflip else y
                for x in range(8):
                    source_x = 7 - x if hflip else x
                    transformed.append(local_indices[(source_y * 8) + source_x])
            packed = []
            for index in range(0, len(transformed), 2):
                packed.append(transformed[index] | (transformed[index + 1] << 4))
            variants.append((tuple(packed), flags, packed))

        matched = next(
            (
                (tile_key, flags)
                for tile_key, flags, _packed in variants
                if tile_key in tile_lookup
            ),
            None,
        )
        if matched is None:
            if optimize_tile_budget is None and len(tiles) >= 1024:
                raise SystemExit("background regular suporta no maximo 1024 tiles unicos")
            tile_key, _flags, packed = variants[0]
            tile_lookup[tile_key] = len(tiles)
            tiles.append(packed)
            matched = (tile_key, 0)
        tile_key, flip_flags = matched
        occurrences.append((bank_index, tile_key, flip_flags))

    if optimize_tile_budget is None:
        optimization = {
            "tile_budget": 1024,
            "tile_count_before": len(tiles),
            "tile_count_after": len(tiles),
            "merged_tile_count": 0,
            "total_mapping_error": 0,
        }
        final_tiles = tiles
        final_tilemap_entries = [
            tile_lookup[tile_key] | flip_flags | (bank_index << 12)
            for bank_index, tile_key, flip_flags in occurrences
        ]
    else:
        remaps, optimization = reduce_background_tile_patterns_by_bank(
            occurrences,
            banks,
            optimize_tile_budget,
        )
        final_tiles = []
        final_tile_lookup = {}
        final_tilemap_entries = []
        for bank_index, tile_key, flip_flags in occurrences:
            final_key = resolved_tile_key(remaps, bank_index, tile_key)
            if final_key not in final_tile_lookup:
                final_tile_lookup[final_key] = len(final_tiles)
                final_tiles.append(list(final_key))
            final_tilemap_entries.append(final_tile_lookup[final_key] | flip_flags | (bank_index << 12))

    palette = []
    for bank in banks:
        palette.extend((0, 0, 0) if color is None else color for color in bank)
        palette.extend([(0, 0, 0)] * (16 - len(bank)))
    result = palette, final_tiles, final_tilemap_entries, tilemap_width, tilemap_height
    if return_optimization:
        return (*result, optimization)
    return result


def build_cached_4bpp_background(
    width,
    height,
    colors,
    indices,
    transparent_index=None,
    optimize_tile_budget=None,
    return_optimization=False,
    max_palette_banks=16,
    reference_plan=None,
):
    """Reuse equivalent inputs within a bounded, single-export cache."""
    cache = BACKGROUND_4BPP_CACHE.get()
    if cache is None:
        return build_4bpp_background(
            width, height, colors, indices, transparent_index, optimize_tile_budget,
            return_optimization, max_palette_banks, reference_plan,
        )
    # Content keys detect in-place edits and freshly parsed equivalent plans.
    # Dimensions affect the tile layout; reporting mode does not affect pixels.
    palette_key = tuple(tuple(color) for color in colors)
    reference_key = json.dumps(reference_plan, sort_keys=True, separators=(",", ":"))
    key = (
        width, height, palette_key, hashlib.sha256(bytes(indices)).digest(),
        transparent_index, optimize_tile_budget, max_palette_banks, reference_key,
    )
    entries = cache["entries"]
    entry = entries.get(key)
    if entry is None:
        result = build_4bpp_background(
            width, height, colors, indices, transparent_index, optimize_tile_budget,
            True, max_palette_banks, reference_plan,
        )
        palette, tiles, tilemap, tilemap_width, tilemap_height, optimization = result
        cached = (tuple(palette), tuple(tuple(tile) for tile in tiles), tuple(tilemap),
                  tilemap_width, tilemap_height, dict(optimization))
        # Bound retained scalar values and reference data, not just entry count.
        size = (len(palette) * 3 + sum(len(tile) for tile in tiles) + len(tilemap)
                + len(palette_key) * 3 + len(reference_key) + len(optimization))
        if size <= BACKGROUND_CACHE_MAX_VALUES and BACKGROUND_CACHE_MAX_ENTRIES > 0:
            while entries and (len(entries) >= BACKGROUND_CACHE_MAX_ENTRIES
                               or cache["values"] + size > BACKGROUND_CACHE_MAX_VALUES):
                _old_key, (_old_result, old_size) = entries.popitem(last=False)
                cache["values"] -= old_size
            entries[key] = (cached, size)
            cache["values"] += size
    else:
        cached, _size = entry
        entries.move_to_end(key)
    palette, tiles, tilemap, tilemap_width, tilemap_height, optimization = cached
    result = (list(palette), [list(tile) for tile in tiles], list(tilemap),
              tilemap_width, tilemap_height)
    return (*result, dict(optimization)) if return_optimization else result


def pack_affine_tile(width, indices, tile_x, tile_y):
    packed = []
    for y in range(8):
        for x in range(8):
            packed.append(indices[(tile_y + y) * width + tile_x + x] & 255)
    return packed


def _affine_tile_distance(left, right):
    return sum(pixel_left != pixel_right for pixel_left, pixel_right in zip(left, right))


def _reduce_affine_tiles(tiles, tilemap_entries, max_tiles):
    """Mapeia tiles affine excedentes para um conjunto determinístico de tiles.

    O tilemap affine armazena índices de 8 bits, portanto o limite físico é 256
    tiles. A seleção usa frequência e distância de Hamming para conservar os
    padrões mais usados e as variações visuais mais distintas, sem alterar o
    tamanho ou a geometria do mapa.
    """
    if len(tiles) <= max_tiles:
        return tiles, tilemap_entries
    if max_tiles < 1:
        raise SystemExit("o orçamento affine precisa reservar pelo menos um tile")

    frequencies = [0] * len(tiles)
    for tile_index in tilemap_entries:
        frequencies[tile_index] += 1

    selected = [max(range(len(tiles)), key=lambda index: (frequencies[index], -index))]
    nearest_distance = [
        _affine_tile_distance(tile, tiles[selected[0]])
        for tile in tiles
    ]
    selected_lookup = {selected[0]}
    while len(selected) < max_tiles:
        candidate = max(
            (index for index in range(len(tiles)) if index not in selected_lookup),
            key=lambda index: (nearest_distance[index], frequencies[index], -index),
        )
        selected.append(candidate)
        selected_lookup.add(candidate)
        candidate_tile = tiles[candidate]
        for index, tile in enumerate(tiles):
            distance = _affine_tile_distance(tile, candidate_tile)
            if distance < nearest_distance[index]:
                nearest_distance[index] = distance

    remap = {}
    for index, tile in enumerate(tiles):
        remap[index] = min(
            range(len(selected)),
            key=lambda selected_index: (
                _affine_tile_distance(tile, tiles[selected[selected_index]]),
                selected[selected_index],
            ),
        )
    reduced_tiles = [tiles[index] for index in selected]
    reduced_tilemap = [remap[index] for index in tilemap_entries]
    return reduced_tiles, reduced_tilemap


def build_affine_tiles(width, height, indices, optimize_tile_budget=None):
    if width % 8 != 0 or height % 8 != 0:
        raise SystemExit("largura e altura precisam ser multiplos de 8")

    tilemap_width = width // 8
    tilemap_height = height // 8
    if tilemap_width != tilemap_height or tilemap_width not in (16, 32, 64, 128):
        raise SystemExit("--affine-tilemap precisa gerar mapa quadrado de 16x16, 32x32, 64x64 ou 128x128 tiles")

    cache_key = (id(indices), optimize_tile_budget)
    cached = AFFINE_TILE_CACHE.get(cache_key)
    if cached is not None:
        return cached

    tiles = []
    tile_lookup = {}
    tilemap_entries = []

    for tile_y in range(0, height, 8):
        for tile_x in range(0, width, 8):
            packed = pack_affine_tile(width, indices, tile_x, tile_y)
            tile_key = tuple(packed)
            if tile_key not in tile_lookup:
                tile_lookup[tile_key] = len(tiles)
                tiles.append(packed)
            tilemap_entries.append(tile_lookup[tile_key])

    if optimize_tile_budget is not None:
        tiles, tilemap_entries = _reduce_affine_tiles(tiles, tilemap_entries, optimize_tile_budget)
    elif len(tiles) > 256:
        raise SystemExit("affine background suporta no maximo 256 tiles unicos")

    result = tiles, tilemap_entries, tilemap_width, tilemap_height
    AFFINE_TILE_CACHE[cache_key] = result
    return result


def build_indexed_background_tiles(width, height, indices, max_source_tiles=1024):
    """Build an 8bpp source atlas for the isometric CPU compositor."""
    if width % 8 != 0 or height % 8 != 0:
        raise SystemExit("indexed background precisa ter largura e altura multiplas de 8")
    tilemap_width = width // 8
    tilemap_height = height // 8
    tiles = []
    tile_lookup = {}
    tilemap_entries = []
    for tile_y in range(0, height, 8):
        for tile_x in range(0, width, 8):
            packed = pack_affine_tile(width, indices, tile_x, tile_y)
            tile_key = tuple(packed)
            if tile_key not in tile_lookup:
                tile_lookup[tile_key] = len(tiles)
                tiles.append(packed)
            tilemap_entries.append(tile_lookup[tile_key])
    if len(tiles) > max_source_tiles:
        raise SystemExit(f"indexed background suporta no maximo {max_source_tiles} tiles fonte")
    return tiles, tilemap_entries, tilemap_width, tilemap_height


def build_rle16_runs(values):
    if not values:
        return []

    runs = []
    current = values[0]
    count = 1
    for value in values[1:]:
        if value == current and count < 0xFFFF:
            count += 1
        else:
            runs.append((current, count))
            current = value
            count = 1
    runs.append((current, count))
    return runs


def _compression_policy_for_pack(policy):
    if policy is None:
        return None
    if policy == "auto":
        return {"strategy": "auto", "tiles": "auto", "tilemap": "auto", "palette": "auto"}
    if not isinstance(policy, dict):
        raise SystemExit("compression_policy deve ser auto ou objeto manual")
    strategy = policy.get("strategy")
    if strategy == "auto":
        if any(policy.get(component, "auto") != "auto" for component in ("tiles", "tilemap", "palette")):
            raise SystemExit("compression_policy: componentes auto devem usar auto")
        return {"strategy": "auto", "tiles": "auto", "tilemap": "auto", "palette": "auto"}
    if strategy != "manual":
        raise SystemExit("compression_policy.strategy deve ser auto ou manual")
    normalized = {"strategy": "manual"}
    for component in ("tiles", "tilemap", "palette"):
        selected = policy.get(component)
        if selected not in PACK_COMPRESSION_STRATEGIES:
            raise SystemExit(f"compression_policy.{component} invalida")
        normalized[component] = selected
    return normalized


def _choose_smallest_compression(raw, candidates):
    options = [("none", len(raw))]
    for name, encoded in candidates:
        if encoded is not None:
            options.append((name, len(encoded)))
    return min(enumerate(options), key=lambda item: (item[1][1], item[0]))[1][0]


def _palette_bytes(values):
    result = bytearray()
    for value in values:
        result.append(value & 0xFF)
        result.append((value >> 8) & 0xFF)
    return bytes(result)


def resolve_pack_compression_policy(policy, kind, tilemap_values=None, tile_bytes=None, palette_values=None):
    normalized = _compression_policy_for_pack(policy)
    if normalized is None:
        return None

    supported = {
        "tiles": kind in ("bg",),
        "tilemap": kind in ("bg",),
        "palette": kind in ("bg", "affine_bg", "obj", "bitmap4", "palette"),
    }
    selected = {"tiles": "none", "tilemap": "none", "palette": "none"}
    if normalized["strategy"] == "manual":
        selected.update({component: normalized[component] for component in selected})
        for component, value in selected.items():
            if value != "none" and not supported[component]:
                raise SystemExit(f"compression_policy.{component} nao e suportada para {kind}")
            if value == "rle16" and component != "tilemap":
                raise SystemExit(f"compression_policy.{component}: rle16 so pode ser usado em tilemap")
        return selected

    if supported["tiles"] and tile_bytes:
        selected["tiles"] = _choose_smallest_compression(tile_bytes, [
            ("lz77", encode_lz77(tile_bytes)),
            ("huffman", encode_huffman(tile_bytes) if len(tile_bytes) % 4 == 0 else None),
        ])
    if supported["tilemap"] and tilemap_values:
        raw = _palette_bytes(tilemap_values)
        selected["tilemap"] = _choose_smallest_compression(raw, [
            ("rle16", bytes(len(build_rle16_runs(tilemap_values)) * 4)),
            ("lz77", encode_lz77(raw)),
            ("huffman", encode_huffman(raw) if len(raw) % 4 == 0 else None),
        ])
    if supported["palette"] and palette_values:
        raw = _palette_bytes(palette_values)
        huffman_values = list(palette_values)
        if len(huffman_values) % 2:
            huffman_values.append(0)
        selected["palette"] = _choose_smallest_compression(raw, [
            ("lz77", encode_lz77(raw)),
            ("huffman", encode_huffman(_palette_bytes(huffman_values))),
        ])
    return selected


def apply_pack_compression_policy(asset, kind, tilemap_values=None, tile_bytes=None, palette_values=None):
    policy = asset.get("compression_policy")
    if policy is None:
        return dict(asset)
    selected = resolve_pack_compression_policy(
        policy,
        kind,
        tilemap_values=tilemap_values,
        tile_bytes=tile_bytes,
        palette_values=palette_values,
    )
    resolved = dict(asset)
    for key in ("rle_tilemap", "lz77_tilemap", "lz77_tiles", "lz77_palette", "huffman_tilemap", "huffman_tiles", "huffman_palette"):
        resolved.pop(key, None)
    resolved["rle_tilemap"] = selected["tilemap"] == "rle16"
    resolved["lz77_tilemap"] = selected["tilemap"] == "lz77"
    resolved["huffman_tilemap"] = selected["tilemap"] == "huffman"
    resolved["lz77_tiles"] = selected["tiles"] == "lz77"
    resolved["huffman_tiles"] = selected["tiles"] == "huffman"
    resolved["lz77_palette"] = selected["palette"] == "lz77"
    resolved["huffman_palette"] = selected["palette"] == "huffman"
    resolved["compression_selected"] = selected
    return resolved


def encode_lz77(data):
    if len(data) > 0xFFFFFF:
        raise SystemExit("LZ77 suporta no maximo 0xFFFFFF bytes decodificados")

    output = bytearray([
        0x10,
        len(data) & 0xFF,
        (len(data) >> 8) & 0xFF,
        (len(data) >> 16) & 0xFF,
    ])
    cursor = 0
    while cursor < len(data):
        flags_index = len(output)
        output.append(0)
        flags = 0
        token_payload = bytearray()
        for bit in range(8):
            if cursor >= len(data):
                break

            best_length = 0
            best_distance = 0
            window_start = max(0, cursor - 4096)
            for candidate in range(window_start, cursor):
                distance = cursor - candidate
                length = 0
                while (
                    length < 18 and
                    cursor + length < len(data) and
                    data[candidate + length] == data[cursor + length]
                ):
                    length += 1
                if length >= 3 and length > best_length:
                    best_length = length
                    best_distance = distance
                    if length == 18:
                        break

            if best_length >= 3:
                flags |= 0x80 >> bit
                displacement = best_distance - 1
                token_payload.append(((best_length - 3) << 4) | ((displacement >> 8) & 0x0F))
                token_payload.append(displacement & 0xFF)
                cursor += best_length
            else:
                token_payload.append(data[cursor])
                cursor += 1
        output[flags_index] = flags
        output.extend(token_payload)
    return bytes(output)


class _HuffmanNode:
    def __init__(self, value, count, left=None, right=None):
        self.value = value
        self.count = count
        self.left = left
        self.right = right
        self.code = 0
        self.code_length = 0
        self.leaves = None

    @property
    def is_parent(self):
        return self.left is not None

    def num_nodes(self):
        if not self.is_parent:
            return 1
        return self.left.num_nodes() + self.right.num_nodes() + 1

    def num_leaves(self):
        if self.leaves is None:
            self.leaves = (
                self.left.num_leaves() + self.right.num_leaves()
                if self.is_parent
                else 1
            )
        return self.leaves


def _build_huffman_tree(data):
    histogram = Counter(data)
    nodes = [
        _HuffmanNode(value, count)
        for value, count in sorted(histogram.items())
    ]
    if not nodes:
        raise SystemExit("Huffman exige dados nao vazios")

    while len(nodes) > 1:
        nodes.sort(key=lambda node: (node.count, node.value))
        parent = _HuffmanNode(0, nodes[0].count + nodes[1].count, nodes[0], nodes[1])
        nodes[0] = parent
        nodes[1] = nodes[-1]
        nodes.pop()

    root = nodes[0]
    if not root.is_parent:
        root = _HuffmanNode(0, root.count, root, _HuffmanNode(0, 0))

    def build_codes(node, code, code_length):
        if node.is_parent:
            if code_length >= 31:
                raise SystemExit("arvore Huffman excede 31 bits por simbolo")
            build_codes(node.left, code << 1, code_length + 1)
            build_codes(node.right, (code << 1) | 1, code_length + 1)
        else:
            node.code = code
            node.code_length = code_length

    build_codes(root, 0, 0)
    return root


def _serialize_huffman_tree(tree, node, next_index):
    if node.num_leaves() > 0x40:
        tree[next_index] = node.left
        tree[next_index + 1] = node.right

        first = 0
        second = 1
        if node.right.num_leaves() < node.left.num_leaves():
            first, second = second, first

        if tree[next_index + first].is_parent:
            tree[next_index + first].value = 0
            _serialize_huffman_tree(
                tree,
                tree[next_index + first],
                next_index + 2,
            )
        if tree[next_index + second].is_parent:
            tree[next_index + second].value = (
                tree[next_index + first].num_leaves() - 1
            )
            _serialize_huffman_tree(
                tree,
                tree[next_index + second],
                next_index + 2 * tree[next_index + first].num_leaves(),
            )
        return

    queue = [node.left, node.right]
    while queue:
        current = queue.pop(0)
        tree[next_index] = current
        next_index += 1
        if current.is_parent:
            current.value = len(queue) // 2
            queue.extend((current.left, current.right))


def _fixup_huffman_tree(tree):
    index = 1
    while index < len(tree):
        node = tree[index]
        if not node.is_parent or node.value <= 0x3F:
            index += 1
            continue

        shift = node.value - 0x3F
        if index & 1 and tree[index - 1].value == 0x3F:
            index -= 1
            shift = 1

        node_end = index // 2 + 1 + tree[index].value
        node_begin = node_end - shift
        shift_begin = 2 * node_begin
        shift_end = 2 * node_end

        moved_pair = (tree[shift_end], tree[shift_end + 1])
        tree[shift_begin + 2:shift_end + 2] = tree[shift_begin:shift_end]
        tree[shift_begin], tree[shift_begin + 1] = moved_pair

        tree[index].value -= shift
        for moved_index in range(index + 1, shift_begin):
            moved_node = tree[moved_index]
            if not moved_node.is_parent:
                continue
            child_index = moved_index // 2 + 1 + moved_node.value
            if node_begin <= child_index < node_end:
                moved_node.value += 1

        if tree[shift_begin].is_parent:
            tree[shift_begin].value += shift
        if tree[shift_begin + 1].is_parent:
            tree[shift_begin + 1].value += shift

        for moved_index in range(shift_begin + 2, shift_end + 2):
            moved_node = tree[moved_index]
            if not moved_node.is_parent:
                continue
            child_index = moved_index // 2 + 1 + moved_node.value
            if child_index > node_end:
                moved_node.value -= 1

        index += 1


def _encode_huffman_tree(root):
    node_count = root.num_nodes()
    tree_size = (node_count + 2) & ~1
    tree = [None] * tree_size
    tree[1] = root
    _serialize_huffman_tree(tree, root, 2)
    _fixup_huffman_tree(tree)
    if any(node is None for node in tree[1:]):
        raise SystemExit("nao foi possivel serializar a arvore Huffman")

    encoded = bytearray(tree_size)
    encoded[0] = node_count // 2
    for index, node in enumerate(tree[1:], start=1):
        value = node.value
        if node.is_parent:
            if not node.left.is_parent:
                value |= 0x80
            if not node.right.is_parent:
                value |= 0x40
        encoded[index] = value
    return bytes(encoded)


def encode_huffman(data):
    data = bytes(data)
    if not data:
        raise SystemExit("Huffman exige dados nao vazios")
    if len(data) > 0xFFFFFF:
        raise SystemExit("Huffman BIOS suporta no maximo 0xFFFFFF bytes decodificados")
    if len(data) % 4:
        raise SystemExit("Huffman BIOS exige dados decodificados alinhados a 4 bytes")

    root = _build_huffman_tree(data)
    lookup = {}

    def collect_lookup(node):
        if node.is_parent:
            collect_lookup(node.left)
            collect_lookup(node.right)
        else:
            lookup[node.value] = node

    collect_lookup(root)
    result = bytearray([
        0x28,
        len(data) & 0xFF,
        (len(data) >> 8) & 0xFF,
        (len(data) >> 16) & 0xFF,
    ])
    result.extend(_encode_huffman_tree(root))

    position = 32
    word = 0
    for value in data:
        node = lookup[value]
        for bit_index in range(node.code_length):
            position -= 1
            if node.code & (1 << (node.code_length - bit_index - 1)):
                word |= 1 << position
            if position == 0:
                result.extend(word.to_bytes(4, "little"))
                position = 32
                word = 0
    if position < 32:
        result.extend(word.to_bytes(4, "little"))
    if len(result) % 4:
        result.extend(b"\0" * (-len(result) % 4))
    return bytes(result)


def build_lz77_palette_lines(name, palette_values, start_index):
    palette_bytes = bytearray()
    for value in palette_values:
        palette_bytes.append(value & 0xFF)
        palette_bytes.append((value >> 8) & 0xFF)
    compressed = encode_lz77(bytes(palette_bytes))
    return [
        "",
        f"constexpr int {name}_lz77_palette_size = {len(compressed)};",
        f"alignas(4) constexpr uint8_t {name}_lz77_palette_data[{len(compressed)}] = {{ {', '.join(hex(v) for v in compressed)} }};",
        f"constexpr gbs::Lz77PaletteAsset {name}_lz77_palette_asset = {{",
        f"    gbs::Lz77Asset {{ {name}_lz77_palette_data, {name}_lz77_palette_size, {len(palette_values) * 2} }},",
        f"    {len(palette_values)},",
        f"    {start_index}",
        "};",
    ]


def build_huffman_palette_lines(name, palette_values, start_index):
    palette_values = list(palette_values)
    color_count = len(palette_values)
    if len(palette_values) % 2:
        palette_values.append(0)
    palette_bytes = bytearray()
    for value in palette_values:
        palette_bytes.append(value & 0xFF)
        palette_bytes.append((value >> 8) & 0xFF)
    compressed = encode_huffman(bytes(palette_bytes))
    return [
        "",
        f"constexpr int {name}_huffman_palette_size = {len(compressed)};",
        f"alignas(4) constexpr uint8_t {name}_huffman_palette_data[{len(compressed)}] = {{ {', '.join(hex(v) for v in compressed)} }};",
        f"constexpr gbs::HuffmanPaletteAsset {name}_huffman_palette_asset = {{",
        f"    gbs::HuffmanAsset {{ {name}_huffman_palette_data, {name}_huffman_palette_size, {len(palette_values) * 2} }},",
        f"    {color_count},",
        f"    {start_index}",
        "};",
    ]


def primary_asset_compression_fields(compression, data_symbol, size_symbol, decoded_count):
    if compression == "none":
        return ""
    enum_names = {
        "rle16": "Rle16",
        "lz77": "Lz77",
        "huffman": "Huffman",
    }
    enum_name = enum_names.get(compression)
    if enum_name is None:
        raise SystemExit(f"compressao primaria desconhecida: {compression}")
    return (
        f", gbs::AssetCompression::{enum_name}, {data_symbol}, "
        f"{size_symbol}, {decoded_count}"
    )


def single_compression_flag(*flags):
    selected = [name for name, enabled in flags if enabled]
    return selected[0] if len(selected) == 1 else "none"


def huffman_palette_decoded_count(color_count):
    return (color_count + (color_count % 2)) * 2


def build_collision_flags(width, height, indices, solid_color_index):
    if solid_color_index < 0 or solid_color_index > 15:
        raise SystemExit("--collision-color-index precisa estar entre 0 e 15")
    if width % 8 != 0 or height % 8 != 0:
        raise SystemExit("largura e altura precisam ser multiplos de 8")

    flags = []
    for tile_y in range(0, height, 8):
        for tile_x in range(0, width, 8):
            solid = False
            for y in range(8):
                for x in range(8):
                    if indices[(tile_y + y) * width + tile_x + x] == solid_color_index:
                        solid = True
            flags.append(1 if solid else 0)
    return flags


def parse_slope_color_indexes(value):
    if value is None:
        return None
    parts = value.split(",")
    if len(parts) != 4:
        raise SystemExit("--slope-color-indexes precisa ter quatro indices: above_rising,below_rising,above_falling,below_falling")
    try:
        parsed = [int(part.strip()) for part in parts]
    except ValueError as exc:
        raise SystemExit("--slope-color-indexes aceita apenas numeros inteiros") from exc
    for index in parsed:
        if index < 0 or index > 15:
            raise SystemExit("--slope-color-indexes precisa usar indices entre 0 e 15")
    return parsed


def build_slope_tiles(width, height, indices, slope_color_indexes):
    if width % 8 != 0 or height % 8 != 0:
        raise SystemExit("largura e altura precisam ser multiplos de 8")

    slope_names = [
        "BlockAboveRising",
        "BlockBelowRising",
        "BlockAboveFalling",
        "BlockBelowFalling",
    ]
    color_to_slope = {
        color_index: slope_name
        for color_index, slope_name in zip(slope_color_indexes, slope_names)
    }

    slopes = []
    for tile_y in range(0, height, 8):
        for tile_x in range(0, width, 8):
            found = "None"
            for y in range(8):
                for x in range(8):
                    color_index = indices[(tile_y + y) * width + tile_x + x]
                    if color_index in color_to_slope:
                        found = color_to_slope[color_index]
                        break
                if found != "None":
                    break
            slopes.append(found)
    return slopes


GBA_OBJ_DIMENSIONS = {
    (8, 8), (16, 16), (32, 32), (64, 64),
    (16, 8), (32, 8), (32, 16), (64, 32),
    (8, 16), (8, 32), (16, 32), (32, 64),
}


def decompose_sprite_frame(sprite_width, sprite_height):
    if (
        sprite_width < 8 or sprite_width > 128 or
        sprite_height < 8 or sprite_height > 128 or
        sprite_width % 8 != 0 or sprite_height % 8 != 0
    ):
        raise SystemExit("--sprite-width/--sprite-height precisa ser multiplo de 8 entre 8 e 128")

    tiles_wide = sprite_width // 8
    tiles_high = sprite_height // 8
    costs = [[float("inf")] * (tiles_high + 1) for _ in range(tiles_wide + 1)]
    choices = [[None] * (tiles_high + 1) for _ in range(tiles_wide + 1)]
    for current_width in range(tiles_wide + 1):
        costs[current_width][0] = 0
    for current_height in range(tiles_high + 1):
        costs[0][current_height] = 0

    for current_width in range(1, tiles_wide + 1):
        for current_height in range(1, tiles_high + 1):
            if (current_width * 8, current_height * 8) in GBA_OBJ_DIMENSIONS:
                costs[current_width][current_height] = 1
                choices[current_width][current_height] = ("native", 0)
                continue
            for split in range(current_width - 1, 0, -1):
                candidate = costs[split][current_height] + costs[current_width - split][current_height]
                if candidate < costs[current_width][current_height]:
                    costs[current_width][current_height] = candidate
                    choices[current_width][current_height] = ("vertical", split)
            for split in range(current_height - 1, 0, -1):
                candidate = costs[current_width][split] + costs[current_width][current_height - split]
                if candidate < costs[current_width][current_height]:
                    costs[current_width][current_height] = candidate
                    choices[current_width][current_height] = ("horizontal", split)

    parts = []

    def append_parts(part_width, part_height, x, y):
        choice = choices[part_width][part_height]
        if choice is None:
            raise SystemExit(f"nao foi possivel decompor metasprite {sprite_width}x{sprite_height}")
        kind, split = choice
        if kind == "native":
            parts.append((x * 8, y * 8, part_width * 8, part_height * 8))
        elif kind == "vertical":
            append_parts(split, part_height, x, y)
            append_parts(part_width - split, part_height, x + split, y)
        else:
            append_parts(part_width, split, x, y)
            append_parts(part_width, part_height - split, x, y + split)

    append_parts(tiles_wide, tiles_high, 0, 0)
    return parts


def pack_tile_hflip(width, indices, tile_x, tile_y):
    packed = []
    for y in range(8):
        for x in range(0, 8, 2):
            a = indices[(tile_y + y) * width + tile_x + 7 - x] & 15
            b = indices[(tile_y + y) * width + tile_x + 6 - x] & 15
            packed.append(a | (b << 4))
    return packed


def pack_tile_8bpp(width, indices, tile_x, tile_y):
    return [
        indices[(tile_y + y) * width + tile_x + x] & 255
        for y in range(8)
        for x in range(8)
    ]


def pack_tile_hflip_8bpp(width, indices, tile_x, tile_y):
    return [
        indices[(tile_y + y) * width + tile_x + 7 - x] & 255
        for y in range(8)
        for x in range(8)
    ]


def sprite_part_tiles(width, indices, origin_x, origin_y, part_width, part_height, bpp=4):
    packer = pack_tile if bpp == 4 else pack_tile_8bpp
    return [
        packer(width, indices, tile_x, tile_y)
        for tile_y in range(origin_y, origin_y + part_height, 8)
        for tile_x in range(origin_x, origin_x + part_width, 8)
    ]


def mirrored_sprite_part_tiles(width, indices, origin_x, origin_y, part_width, part_height, bpp=4):
    packer = pack_tile_hflip if bpp == 4 else pack_tile_hflip_8bpp
    return [
        packer(width, indices, tile_x, tile_y)
        for tile_y in range(origin_y, origin_y + part_height, 8)
        for tile_x in range(origin_x + part_width - 8, origin_x - 1, -8)
    ]


def build_sprite_tile_plan(width, height, indices, sprite_width, sprite_height, bpp=4):
    if bpp not in (4, 8):
        raise SystemExit("sprite_bpp suporta somente 4 ou 8")
    parts = decompose_sprite_frame(sprite_width, sprite_height)
    if width % sprite_width != 0 or height % sprite_height != 0:
        raise SystemExit("spritesheet precisa ter dimensoes multiplas do tamanho do sprite")

    frame_columns = width // sprite_width
    frame_rows = height // sprite_height
    frame_count = frame_columns * frame_rows
    tiles = []
    block_lookup = {}
    frame_tiles = []
    frame_parts = []
    stream_frame_parts = []
    source_lookup = {}

    for frame_y in range(frame_rows):
        for frame_x in range(frame_columns):
            origin_x = frame_x * sprite_width
            origin_y = frame_y * sprite_height
            current_parts = []
            current_stream_parts = []
            current_tiles = []
            current_lookup = {}
            for part_x, part_y, part_width, part_height in parts:
                source_x = origin_x + part_x
                source_y = origin_y + part_y
                block = sprite_part_tiles(width, indices, source_x, source_y, part_width, part_height, bpp)
                block_key = tuple(tuple(tile) for tile in block)
                mirrored = mirrored_sprite_part_tiles(width, indices, source_x, source_y, part_width, part_height, bpp)
                mirrored_key = tuple(tuple(tile) for tile in mirrored)
                hflip = False
                if block_key in block_lookup:
                    tile_offset = block_lookup[block_key]
                elif mirrored_key in block_lookup:
                    tile_offset = block_lookup[mirrored_key]
                    hflip = True
                else:
                    tile_offset = len(tiles)
                    block_lookup[block_key] = tile_offset
                    tiles.extend(block)
                stream_hflip = False
                if block_key in current_lookup:
                    stream_tile_offset = current_lookup[block_key]
                elif mirrored_key in current_lookup:
                    stream_tile_offset = current_lookup[mirrored_key]
                    stream_hflip = True
                else:
                    stream_tile_offset = len(current_tiles)
                    current_lookup[block_key] = stream_tile_offset
                    current_tiles.extend(block)
                current_parts.append({"tile_offset": tile_offset, "hflip": hflip})
                current_stream_parts.append({"tile_offset": stream_tile_offset, "hflip": stream_hflip})
                source_lookup[(source_x, source_y, part_width, part_height)] = (tile_offset, hflip)
                tiles_wide = part_width // 8
                tiles_high = part_height // 8
                for local_y in range(tiles_high):
                    for local_x in range(tiles_wide):
                        canonical_x = tiles_wide - 1 - local_x if hflip else local_x
                        source_lookup[(source_x + local_x * 8, source_y + local_y * 8)] = (
                            tile_offset + local_y * tiles_wide + canonical_x,
                            hflip,
                        )
            frame_parts.append(current_parts)
            stream_frame_parts.append(current_stream_parts)
            frame_tiles.append(current_tiles)

    return {
        "tiles": tiles,
        "frame_tiles": frame_tiles,
        "frame_tile_counts": [len(frame) for frame in frame_tiles],
        "frame_count": frame_count,
        "frame_columns": frame_columns,
        "parts": parts,
        "frame_parts": frame_parts,
        "stream_frame_parts": stream_frame_parts,
        "source_lookup": source_lookup,
        "original_tile_count": frame_count * sum(
            (part_width // 8) * (part_height // 8)
            for _part_x, _part_y, part_width, part_height in parts
        ),
    }


def build_sprite_tiles(width, height, indices, sprite_width, sprite_height, bpp=4):
    plan = build_sprite_tile_plan(width, height, indices, sprite_width, sprite_height, bpp)
    return plan["tiles"], plan["frame_count"], plan["frame_columns"]


def build_obj_sprite_tile_lookup(width, height, indices, sprite_width, sprite_height, destination_tile, bpp=4, stream_frames=False):
    plan = build_sprite_tile_plan(width, height, indices, sprite_width, sprite_height, bpp)
    tile_stride = 2 if bpp == 8 else 1
    if stream_frames:
        lookup = {}
        for frame_index, frame_parts in enumerate(plan["stream_frame_parts"]):
            origin_x = (frame_index % plan["frame_columns"]) * sprite_width
            origin_y = (frame_index // plan["frame_columns"]) * sprite_height
            for (part_x, part_y, part_width, part_height), optimized in zip(plan["parts"], frame_parts):
                source_x = origin_x + part_x
                source_y = origin_y + part_y
                tile_offset = optimized["tile_offset"]
                hflip = optimized["hflip"]
                lookup[(source_x, source_y, part_width, part_height)] = (
                    destination_tile + tile_offset * tile_stride, hflip
                )
                tiles_wide = part_width // 8
                for local_y in range(part_height // 8):
                    for local_x in range(tiles_wide):
                        canonical_x = tiles_wide - 1 - local_x if hflip else local_x
                        lookup[(source_x + local_x * 8, source_y + local_y * 8)] = (
                            destination_tile + (tile_offset + local_y * tiles_wide + canonical_x) * tile_stride,
                            hflip,
                        )
        return lookup
    return {
        key: (destination_tile + tile_offset * tile_stride, hflip)
        for key, (tile_offset, hflip) in plan["source_lookup"].items()
    }


def sprite_asset_pack_header(asset_report, asset_id):
    export_plan = asset_report.get("export_plan", {}) if asset_report is not None else {}
    headers = export_plan.get("headers", [])
    if not isinstance(headers, list):
        return None
    for header in headers:
        if not isinstance(header, dict):
            continue
        if header.get("id") == asset_id or header.get("symbol") == asset_id:
            return header
    return None


def obj_sprite_tile_lookup_for_asset(asset_report, base_dir, asset_id, description):
    header = sprite_asset_pack_header(asset_report, asset_id)
    if header is None:
        raise SystemExit(f"{description} asset pack desconhecido: {asset_id}")
    inputs = header.get("inputs", [])
    if not isinstance(inputs, list) or not inputs:
        raise SystemExit(f"{description} asset {asset_id} sem PNG fonte")
    path = base_dir / inputs[0]
    args = header.get("assetc_args", [])
    source_bytes = path.read_bytes()
    cache_key = (str(path.resolve()), hashlib.sha256(source_bytes).digest(),
                 json.dumps(header, sort_keys=True, separators=(",", ":")))
    cache = OBJ_LOOKUP_CACHE.get()
    if cache is not None and cache_key in cache["entries"]:
        cached = cache["entries"][cache_key]
        cache["entries"].move_to_end(cache_key)
        return cached[0].copy(), cached[1], cached[2], cached[3].copy() if cached[3] is not None else None
    sprite_bpp = assetc_arg_int(args, "--sprite-bpp", 4)
    width, height, colors, indices, transparent = read_png(path, max_colors=None if sprite_bpp == 8 else 16, include_transparency=True, _source_bytes=source_bytes)
    if "obj_pixel_options" in header:
        colors, indices = prepare_obj_asset_pixels(colors, indices, transparent, header["obj_pixel_options"])
    destination_tile = assetc_arg_int(args, "--destination-tile", 0)
    palette_bank = assetc_arg_int(args, "--palette-bank", 0)
    sprite_width = 16
    sprite_height = 16
    for index, arg in enumerate(args):
        if arg == "--sprite-width" and index + 1 < len(args):
            sprite_width = int(args[index + 1])
        if arg == "--sprite-height" and index + 1 < len(args):
            sprite_height = int(args[index + 1])
    stream_frames = "--stream-frames" in args
    lookup = build_obj_sprite_tile_lookup(
        width, height, indices, sprite_width, sprite_height, destination_tile, sprite_bpp, stream_frames
    )
    stream_info = {
        "symbol": header.get("symbol", asset_id),
        "sprite_width": sprite_width,
        "sprite_height": sprite_height,
        "frame_columns": width // sprite_width,
    } if stream_frames else None
    result = lookup, 0 if sprite_bpp == 8 else palette_bank, sprite_bpp, stream_info
    if cache is not None and len(lookup) <= OBJ_LOOKUP_CACHE_MAX_KEYS:
        while cache["entries"] and (len(cache["entries"]) >= OBJ_LOOKUP_CACHE_MAX_ENTRIES
                                    or cache["keys"] + len(lookup) > OBJ_LOOKUP_CACHE_MAX_KEYS):
            _, removed = cache["entries"].popitem(last=False)
            cache["keys"] -= len(removed[0])
        if OBJ_LOOKUP_CACHE_MAX_ENTRIES > 0:
            cache["entries"][cache_key] = (lookup.copy(), result[1], result[2], stream_info.copy() if stream_info is not None else None)
            cache["keys"] += len(lookup)
    return result


def emit_custom_metasprite_part(part, tile_lookup, default_palette, sprite_bpp=4):
    slice_x = int(part.get("slice_x", 0))
    slice_y = int(part.get("slice_y", 0))
    x = int(part.get("x", 0))
    y = int(part.get("y", 0))
    palette = 0 if sprite_bpp == 8 else int(part.get("palette", default_palette))
    width = int(part.get("width", 16))
    height = int(part.get("height", 16))
    if (width, height) not in GBA_OBJ_DIMENSIONS:
        raise SystemExit(f"parte de metasprite {width}x{height} nao usa formato OBJ nativo do GBA")
    if slice_x % 8 != 0 or slice_y % 8 != 0:
        raise SystemExit("slice de metasprite precisa estar alinhado a 8 pixels")
    hflip = "true" if part.get("hflip") else "false"
    vflip = "true" if part.get("vflip") else "false"
    block_key = (slice_x, slice_y, width, height)
    key = block_key if block_key in tile_lookup else (slice_x, slice_y)
    if key not in tile_lookup:
        raise SystemExit(f"slice ({slice_x}, {slice_y}) fora do spritesheet")
    tile_index, optimized_hflip = tile_lookup[key]
    if optimized_hflip and key != block_key and (width > 8 or height > 8):
        raise SystemExit("parte customizada precisa coincidir com bloco OBJ otimizado")
    combined_hflip = (part.get("hflip") is True) != optimized_hflip
    hflip = "true" if combined_hflip else "false"
    color_depth = ", gbs::ColorDepth::Bpp8" if sprite_bpp == 8 else ""
    return f"{{ {x}, {y}, {tile_index}, {palette}, {hflip}, {vflip}, {width}, {height}{color_depth} }}"


def emit_animation_custom_metasprites(output, prefix, name, entry, asset_report, base_dir, description):
    frames = entry.get("frame_metasprites")
    if not frames:
        return None
    if base_dir is None:
        raise SystemExit(f"{description} precisa do diretorio base para frame_metasprites")
    asset_id = entry.get("asset")
    if not isinstance(asset_id, str):
        reference = entry.get("animation")
        if isinstance(reference, dict):
            asset_id = reference.get("asset")
    if not isinstance(asset_id, str) or not asset_id:
        raise SystemExit(f"{description}.asset precisa ser string para frame_metasprites")
    tile_lookup, default_palette, sprite_bpp, stream_info = obj_sprite_tile_lookup_for_asset(
        asset_report, base_dir, asset_id, description
    )
    symbol = f"{pack_safe_identifier(prefix)}_{pack_safe_identifier(name)}_custom_metasprites"
    source_frames = []
    for frame_index, frame in enumerate(frames):
        parts = frame.get("parts", [])
        if not isinstance(parts, list) or not parts:
            raise SystemExit(f"{description}.frame_metasprites[{frame_index}].parts invalido")
        if stream_info is not None:
            source_indices = set()
            for part in parts:
                slice_x = int(part.get("slice_x", 0))
                slice_y = int(part.get("slice_y", 0))
                frame_x = slice_x // stream_info["sprite_width"]
                frame_y = slice_y // stream_info["sprite_height"]
                if (slice_x + int(part.get("width", 16)) > (frame_x + 1) * stream_info["sprite_width"]
                        or slice_y + int(part.get("height", 16)) > (frame_y + 1) * stream_info["sprite_height"]):
                    raise SystemExit(f"{description}.frame_metasprites[{frame_index}] cruza quadros do sprite streamed")
                source_indices.add(frame_y * stream_info["frame_columns"] + frame_x)
            if len(source_indices) != 1:
                raise SystemExit(f"{description}.frame_metasprites[{frame_index}] usa mais de um quadro streamed")
            source_frames.append(source_indices.pop())
        parts_symbol = f"{symbol}_frame_{frame_index}_parts"
        output.append(f"constexpr gbs::MetaSpritePart {parts_symbol}[{len(parts)}] = {{")
        for part in parts:
            if not isinstance(part, dict):
                raise SystemExit(f"{description}.frame_metasprites[{frame_index}].parts precisa ser objeto")
            output.append(f"    {emit_custom_metasprite_part(part, tile_lookup, default_palette, sprite_bpp)},")
        output.append("};")
    output.append(f"constexpr gbs::MetaSprite {symbol}[{len(frames)}] = {{")
    for frame_index, frame in enumerate(frames):
        part_count = len(frame.get("parts", []))
        output.append(f"    {{ {symbol}_frame_{frame_index}_parts, {part_count} }},")
    output.append("};")
    output.append("")
    return symbol, stream_info["symbol"] if stream_info is not None else None, source_frames


def emit_header(
    name,
    width,
    height,
    colors,
    indices,
    destination_tile,
    palette_bank,
    object_tiles,
    rle_tilemap,
    lz77_tilemap,
    lz77_tiles,
    lz77_palette,
    collision_color_index,
    slope_color_indexes,
    background_bpp=4,
    transparent_index=None,
    optimize_tile_budget=None,
    tile_optimization=None,
    background_palette_banks=16,
    reference_plan=None,
    huffman_tilemap=False,
    huffman_tiles=False,
    huffman_palette=False,
    compression_policy=None,
):
    if destination_tile < 0 or destination_tile >= 1024:
        raise SystemExit("--destination-tile precisa estar entre 0 e 1023")
    if palette_bank < 0 or palette_bank > 15:
        raise SystemExit("--palette-bank precisa estar entre 0 e 15")

    if background_bpp != 4:
        raise SystemExit("--background-bpp suporta somente 4bpp")
    if background_palette_banks < 1 or background_palette_banks > 16:
        raise SystemExit("--background-palette-banks precisa estar entre 1 e 16")
    if object_tiles:
        tiles, tilemap_entries, tilemap_width, tilemap_height = build_tiles(width, height, indices)
        palette_colors = list(colors) + [(0, 0, 0)] * (16 - len(colors))
        tilemap_values = [destination_tile + tile_index + (palette_bank << 12) for tile_index in tilemap_entries]
        palette_start = palette_bank * 16
        bytes_per_tile = 32
    else:
        if optimize_tile_budget is None:
            palette_colors, tiles, tilemap_entries, tilemap_width, tilemap_height = build_cached_4bpp_background(
                width,
                height,
                colors,
                indices,
                transparent_index,
                max_palette_banks=background_palette_banks,
                reference_plan=reference_plan,
            )
        else:
            palette_colors, tiles, tilemap_entries, tilemap_width, tilemap_height, optimization = build_cached_4bpp_background(
                width,
                height,
                colors,
                indices,
                transparent_index,
                optimize_tile_budget=optimize_tile_budget,
                return_optimization=True,
                max_palette_banks=background_palette_banks,
                reference_plan=reference_plan,
            )
            if tile_optimization is not None:
                tile_optimization.update(optimization)
        bank_count = len(palette_colors) // 16
        if palette_bank + bank_count > 16:
            raise SystemExit("background 4bpp excede os bancos disponiveis a partir de --palette-bank")
        tilemap_values = [
            destination_tile + (entry & 0x0FFF) + ((palette_bank + (entry >> 12)) << 12)
            for entry in tilemap_entries
        ]
        palette_start = palette_bank * 16
        bytes_per_tile = 32

    tile_limit = 1024
    if destination_tile + len(tiles) > tile_limit:
        raise SystemExit(f"tiles gerados excedem o limite de {tile_limit} tiles a partir do destino informado")

    palette_values = [rgb15(c) for c in palette_colors]
    selected_compression = {
        "tilemap": single_compression_flag(
            ("rle16", rle_tilemap),
            ("lz77", lz77_tilemap),
            ("huffman", huffman_tilemap),
        ),
        "tiles": single_compression_flag(("lz77", lz77_tiles), ("huffman", huffman_tiles)),
        "palette": single_compression_flag(("lz77", lz77_palette), ("huffman", huffman_palette)),
    }
    if compression_policy is not None:
        selected = resolve_pack_compression_policy(
            compression_policy,
            "bg",
            tilemap_values=tilemap_values,
            tile_bytes=bytes(value for tile in tiles for value in tile),
            palette_values=palette_values,
        )
        rle_tilemap = selected["tilemap"] == "rle16"
        lz77_tilemap = selected["tilemap"] == "lz77"
        huffman_tilemap = selected["tilemap"] == "huffman"
        lz77_tiles = selected["tiles"] == "lz77"
        huffman_tiles = selected["tiles"] == "huffman"
        lz77_palette = selected["palette"] == "lz77"
        huffman_palette = selected["palette"] == "huffman"
        selected_compression = selected
    object_literal = "true" if object_tiles else "false"
    includes = [
        "#include <stdint.h>",
        "#include \"gbs/assets.hpp\"",
    ]
    if rle_tilemap or lz77_tilemap or lz77_tiles or lz77_palette or huffman_tilemap or huffman_tiles or huffman_palette:
        includes.append("#include \"gbs/compression.hpp\"")
    if collision_color_index is not None or slope_color_indexes is not None:
        includes.append("#include \"gbs/topdown.hpp\"")
    lines = [
        "#pragma once",
        *includes,
        "",
        f"constexpr int {name}_width = {width};",
        f"constexpr int {name}_height = {height};",
        f"constexpr int {name}_tilemap_width = {tilemap_width};",
        f"constexpr int {name}_tilemap_height = {tilemap_height};",
        f"constexpr int {name}_tile_count = {len(tiles)};",
        f"constexpr uint16_t {name}_palette[{len(palette_values)}] = {{ {', '.join(hex(v) for v in palette_values)} }};",
        f"alignas(2) constexpr uint8_t {name}_tiles[{len(tiles)}][{bytes_per_tile}] = {{",
    ]
    for tile in tiles:
        lines.append("    { " + ", ".join(hex(v) for v in tile) + " },")
    lines.append("};")
    lines.extend([
        "",
        f"constexpr uint16_t {name}_tilemap_entries[{len(tilemap_values)}] = {{ {', '.join(hex(v) for v in tilemap_values)} }};",
    ])
    if rle_tilemap:
        runs = build_rle16_runs(tilemap_values)
        lines.extend([
            "",
            f"constexpr int {name}_tilemap_rle_run_count = {len(runs)};",
            f"constexpr gbs::Rle16Run {name}_tilemap_rle_runs[{len(runs)}] = {{",
        ])
        for value, count in runs:
            lines.append(f"    {{ {hex(value)}, {count} }},")
        lines.extend([
            "};",
            f"constexpr gbs::Rle16TileMapAsset {name}_tilemap_rle_asset = {{",
            f"    gbs::Rle16Asset {{ {name}_tilemap_rle_runs, {name}_tilemap_rle_run_count, {len(tilemap_values)} }},",
            f"    {name}_tilemap_width,",
            f"    {name}_tilemap_height",
            "};",
        ])
    if lz77_tilemap:
        tilemap_bytes = bytearray()
        for value in tilemap_values:
            tilemap_bytes.append(value & 0xFF)
            tilemap_bytes.append((value >> 8) & 0xFF)
        compressed = encode_lz77(bytes(tilemap_bytes))
        lines.extend([
            "",
            f"constexpr int {name}_tilemap_lz77_size = {len(compressed)};",
            f"alignas(4) constexpr uint8_t {name}_tilemap_lz77_data[{len(compressed)}] = {{ {', '.join(hex(v) for v in compressed)} }};",
            f"constexpr gbs::Lz77TileMapAsset {name}_tilemap_lz77_asset = {{",
            f"    gbs::Lz77Asset {{ {name}_tilemap_lz77_data, {name}_tilemap_lz77_size, {len(tilemap_values) * 2} }},",
            f"    {name}_tilemap_width,",
            f"    {name}_tilemap_height",
            "};",
        ])
    if lz77_tiles:
        tile_bytes = bytearray()
        for tile in tiles:
            tile_bytes.extend(tile)
        compressed = encode_lz77(bytes(tile_bytes))
        lines.extend([
            "",
            f"constexpr int {name}_lz77_tile_size = {len(compressed)};",
            f"alignas(4) constexpr uint8_t {name}_lz77_tile_data[{len(compressed)}] = {{ {', '.join(hex(v) for v in compressed)} }};",
            f"constexpr gbs::Lz77TileAsset {name}_lz77_tile_asset = {{",
            f"    gbs::Lz77Asset {{ {name}_lz77_tile_data, {name}_lz77_tile_size, {len(tiles) * bytes_per_tile} }},",
            f"    {name}_tile_count,",
            f"    {destination_tile},",
            f"    {object_literal}"
            "};",
        ])
    if lz77_palette:
        lines.extend(build_lz77_palette_lines(name, palette_values, palette_start))
    if huffman_tilemap:
        tilemap_bytes = bytearray()
        for value in tilemap_values:
            tilemap_bytes.append(value & 0xFF)
            tilemap_bytes.append((value >> 8) & 0xFF)
        compressed = encode_huffman(bytes(tilemap_bytes))
        lines.extend([
            "",
            f"constexpr int {name}_tilemap_huffman_size = {len(compressed)};",
            f"alignas(4) constexpr uint8_t {name}_tilemap_huffman_data[{len(compressed)}] = {{ {', '.join(hex(v) for v in compressed)} }};",
            f"constexpr gbs::HuffmanTileMapAsset {name}_tilemap_huffman_asset = {{",
            f"    gbs::HuffmanAsset {{ {name}_tilemap_huffman_data, {name}_tilemap_huffman_size, {len(tilemap_values) * 2} }},",
            f"    {name}_tilemap_width,",
            f"    {name}_tilemap_height",
            "};",
        ])
    if huffman_tiles:
        tile_bytes = bytearray()
        for tile in tiles:
            tile_bytes.extend(tile)
        compressed = encode_huffman(bytes(tile_bytes))
        lines.extend([
            "",
            f"constexpr int {name}_huffman_tile_size = {len(compressed)};",
            f"alignas(4) constexpr uint8_t {name}_huffman_tile_data[{len(compressed)}] = {{ {', '.join(hex(v) for v in compressed)} }};",
            f"constexpr gbs::HuffmanTileAsset {name}_huffman_tile_asset = {{",
            f"    gbs::HuffmanAsset {{ {name}_huffman_tile_data, {name}_huffman_tile_size, {len(tiles) * bytes_per_tile} }},",
            f"    {name}_tile_count,",
            f"    {destination_tile},",
            f"    {object_literal}",
            "};",
        ])
    if huffman_palette:
        lines.extend(build_huffman_palette_lines(name, palette_values, palette_start))

    palette_compression = selected_compression["palette"]
    if palette_compression == "lz77":
        palette_compression_fields = primary_asset_compression_fields(
            palette_compression,
            f"{name}_lz77_palette_data",
            f"{name}_lz77_palette_size",
            len(palette_values) * 2,
        )
    elif palette_compression == "huffman":
        palette_compression_fields = primary_asset_compression_fields(
            palette_compression,
            f"{name}_huffman_palette_data",
            f"{name}_huffman_palette_size",
            huffman_palette_decoded_count(len(palette_values)),
        )
    else:
        palette_compression_fields = ""

    tiles_compression = selected_compression["tiles"]
    if tiles_compression == "lz77":
        tiles_compression_fields = primary_asset_compression_fields(
            tiles_compression,
            f"{name}_lz77_tile_data",
            f"{name}_lz77_tile_size",
            len(tiles) * bytes_per_tile,
        )
    elif tiles_compression == "huffman":
        tiles_compression_fields = primary_asset_compression_fields(
            tiles_compression,
            f"{name}_huffman_tile_data",
            f"{name}_huffman_tile_size",
            len(tiles) * bytes_per_tile,
        )
    else:
        tiles_compression_fields = ""

    tilemap_compression = selected_compression["tilemap"]
    if tilemap_compression == "rle16":
        tilemap_compression_fields = primary_asset_compression_fields(
            tilemap_compression,
            f"{name}_tilemap_rle_runs",
            f"{name}_tilemap_rle_run_count",
            len(tilemap_values),
        )
    elif tilemap_compression == "lz77":
        tilemap_compression_fields = primary_asset_compression_fields(
            tilemap_compression,
            f"{name}_tilemap_lz77_data",
            f"{name}_tilemap_lz77_size",
            len(tilemap_values) * 2,
        )
    elif tilemap_compression == "huffman":
        tilemap_compression_fields = primary_asset_compression_fields(
            tilemap_compression,
            f"{name}_tilemap_huffman_data",
            f"{name}_tilemap_huffman_size",
            len(tilemap_values) * 2,
        )
    else:
        tilemap_compression_fields = ""

    lines.extend([
        "",
        f"constexpr gbs::PaletteAsset {name}_palette_asset = {{ {name}_palette, {len(palette_values)}, {palette_start}{palette_compression_fields} }};",
        f"const gbs::TileAsset {name}_tile_asset = {{ reinterpret_cast<const uint8_t*>({name}_tiles), {name}_tile_count, {destination_tile}, {object_literal}{', gbs::ColorDepth::Bpp4' if tiles_compression != 'none' else ''}{tiles_compression_fields} }};",
        f"constexpr gbs::TileMapAsset {name}_tilemap_asset = {{ {name}_tilemap_entries, {name}_tilemap_width, {name}_tilemap_height{tilemap_compression_fields} }};",
    ])
    collision_flags = None
    if collision_color_index is not None:
        collision_flags = build_collision_flags(width, height, indices, collision_color_index)
    elif slope_color_indexes is not None:
        collision_flags = [0] * len(tilemap_values)

    slope_tiles = None
    if slope_color_indexes is not None:
        slope_tiles = build_slope_tiles(width, height, indices, slope_color_indexes)

    if collision_flags is not None:
        lines.extend([
            "",
            f"constexpr uint8_t {name}_collision_flags[{len(collision_flags)}] = {{ {', '.join(hex(v) for v in collision_flags)} }};",
        ])
    if slope_tiles is not None:
        lines.extend([
            "",
            f"constexpr gbs::TileSlope {name}_slope_tiles[{len(slope_tiles)}] = {{",
        ])
        for slope_name in slope_tiles:
            lines.append(f"    gbs::TileSlope::{slope_name},")
        lines.append("};")
    if collision_flags is not None:
        slope_pointer = f"{name}_slope_tiles" if slope_tiles is not None else "nullptr"
        lines.append(f"constexpr gbs::TileMap {name}_collision_map = {{ {name}_collision_flags, {name}_tilemap_width, {name}_tilemap_height, {slope_pointer} }};")
    lines.append("")
    return "\n".join(lines)


def emit_bitmap_header(name, width, height, colors, indices, bitmap_mode, palette_bank, lz77_palette, huffman_palette=False, compression_policy=None):
    if bitmap_mode not in (3, 4, 5):
        raise SystemExit("--bitmap-mode aceita apenas 3, 4 ou 5")
    if palette_bank < 0 or palette_bank > 15:
        raise SystemExit("--palette-bank precisa estar entre 0 e 15")

    max_width = 160 if bitmap_mode == 5 else 240
    max_height = 128 if bitmap_mode == 5 else 160
    if width > max_width or height > max_height:
        raise SystemExit(f"bitmap mode {bitmap_mode} suporta no maximo {max_width}x{max_height}")

    display_mode = {
        3: "gbs::DisplayMode::Mode3Bitmap",
        4: "gbs::DisplayMode::Mode4Bitmap",
        5: "gbs::DisplayMode::Mode5Bitmap",
    }[bitmap_mode]
    if bitmap_mode == 4:
        palette_values = [rgb15(c) for c in colors]
        selected_compression = single_compression_flag(("lz77", lz77_palette), ("huffman", huffman_palette))
        if compression_policy is not None:
            selected = resolve_pack_compression_policy(compression_policy, "bitmap4", palette_values=palette_values)
            lz77_palette = selected["palette"] == "lz77"
            huffman_palette = selected["palette"] == "huffman"
            selected_compression = selected["palette"]
        if palette_bank * 16 + len(palette_values) > 256:
            raise SystemExit("palette de bitmap mode 4 excede 256 cores a partir do palette bank informado")
    else:
        palette_values = [rgb15(c) for c in colors]
        selected_compression = "none"
        if compression_policy is not None:
            selected = resolve_pack_compression_policy(compression_policy, f"bitmap{bitmap_mode}", palette_values=palette_values)
            selected_compression = selected["palette"]

    includes = [
        "#include <stdint.h>",
        "#include \"gbs/render.hpp\"",
    ]
    if selected_compression != "none":
        includes.append("#include \"gbs/compression.hpp\"")
    lines = [
        "#pragma once",
        *includes,
        "",
        f"constexpr int {name}_width = {width};",
        f"constexpr int {name}_height = {height};",
        f"constexpr gbs::DisplayMode {name}_display_mode = {display_mode};",
    ]

    if bitmap_mode == 4:
        lines.extend([
            f"constexpr uint16_t {name}_palette[{len(palette_values)}] = {{ {', '.join(hex(v) for v in palette_values)} }};",
            f"constexpr uint8_t {name}_bitmap_pixels[{len(indices)}] = {{ {', '.join(hex(v) for v in indices)} }};",
            f"constexpr gbs::Bitmap8Asset {name}_bitmap_asset = {{ {name}_bitmap_pixels, {name}_width, {name}_height }};",
        ])
        if lz77_palette:
            lines.extend(build_lz77_palette_lines(name, palette_values, palette_bank * 16))
        if huffman_palette:
            lines.extend(build_huffman_palette_lines(name, palette_values, palette_bank * 16))
        if selected_compression == "lz77":
            fields = primary_asset_compression_fields(
                selected_compression,
                f"{name}_lz77_palette_data",
                f"{name}_lz77_palette_size",
                len(palette_values) * 2,
            )
        elif selected_compression == "huffman":
            fields = primary_asset_compression_fields(
                selected_compression,
                f"{name}_huffman_palette_data",
                f"{name}_huffman_palette_size",
                huffman_palette_decoded_count(len(palette_values)),
            )
        else:
            fields = ""
        lines.extend([
            "",
            f"constexpr gbs::PaletteAsset {name}_palette_asset = {{ {name}_palette, {len(palette_values)}, {palette_bank * 16}{fields} }};",
        ])
    else:
        pixels = [palette_values[index] for index in indices]
        lines.extend([
            f"constexpr uint16_t {name}_bitmap_pixels[{len(pixels)}] = {{ {', '.join(hex(v) for v in pixels)} }};",
            f"constexpr gbs::Bitmap16Asset {name}_bitmap_asset = {{ {name}_bitmap_pixels, {name}_width, {name}_height }};",
        ])

    lines.append("")
    return "\n".join(lines)


def emit_affine_header(
    name,
    width,
    height,
    colors,
    indices,
    destination_tile,
    lz77_palette,
    optimize_tile_budget=None,
    huffman_palette=False,
    compression_policy=None,
):
    if destination_tile < 0 or destination_tile >= 256:
        raise SystemExit("--destination-tile precisa estar entre 0 e 255 para --affine-tilemap")

    tiles, tilemap_entries, tilemap_width, tilemap_height = build_affine_tiles(
        width,
        height,
        indices,
        optimize_tile_budget=optimize_tile_budget,
    )
    if destination_tile + len(tiles) > 256:
        raise SystemExit("tiles affine gerados excedem o limite de 256 tiles a partir do destino informado")

    palette_values = [rgb15(c) for c in colors]
    selected_compression = single_compression_flag(("lz77", lz77_palette), ("huffman", huffman_palette))
    if compression_policy is not None:
        selected = resolve_pack_compression_policy(compression_policy, "affine_bg", palette_values=palette_values)
        lz77_palette = selected["palette"] == "lz77"
        huffman_palette = selected["palette"] == "huffman"
        selected_compression = selected["palette"]
    tilemap_values = [destination_tile + tile_index for tile_index in tilemap_entries]
    includes = [
        "#include <stdint.h>",
        "#include \"gbs/assets.hpp\"",
        "#include \"gbs/render.hpp\"",
    ]
    if selected_compression != "none":
        includes.append("#include \"gbs/compression.hpp\"")
    lines = [
        "#pragma once",
        *includes,
        "",
        f"constexpr int {name}_width = {width};",
        f"constexpr int {name}_height = {height};",
        f"constexpr int {name}_tilemap_width = {tilemap_width};",
        f"constexpr int {name}_tilemap_height = {tilemap_height};",
        f"constexpr int {name}_tile_count = {len(tiles)};",
        f"constexpr uint16_t {name}_palette[{len(palette_values)}] = {{ {', '.join(hex(v) for v in palette_values)} }};",
        f"alignas(2) constexpr uint8_t {name}_tiles[{len(tiles)}][64] = {{",
    ]
    for tile in tiles:
        lines.append("    { " + ", ".join(hex(v) for v in tile) + " },")
    lines.extend([
        "};",
        "",
        f"constexpr uint8_t {name}_tilemap_entries[{len(tilemap_values)}] = {{ {', '.join(hex(v) for v in tilemap_values)} }};",
        "",
        f"const gbs::AffineTileAsset {name}_tile_asset = {{ reinterpret_cast<const uint8_t*>({name}_tiles), {name}_tile_count, {destination_tile} }};",
        f"constexpr gbs::AffineTileMapAsset {name}_tilemap_asset = {{ {name}_tilemap_entries, {name}_tilemap_width, {name}_tilemap_height }};",
        f"constexpr gbs::AffineBackgroundMapSize {name}_map_size = gbs::affine_background_map_size_for_dimensions({name}_tilemap_width, {name}_tilemap_height);",
        "",
    ])
    if lz77_palette:
        lines.extend(build_lz77_palette_lines(name, palette_values, 0))
    if huffman_palette:
        lines.extend(build_huffman_palette_lines(name, palette_values, 0))
    if selected_compression == "lz77":
        fields = primary_asset_compression_fields(
            selected_compression,
            f"{name}_lz77_palette_data",
            f"{name}_lz77_palette_size",
            len(palette_values) * 2,
        )
    elif selected_compression == "huffman":
        fields = primary_asset_compression_fields(
            selected_compression,
            f"{name}_huffman_palette_data",
            f"{name}_huffman_palette_size",
            huffman_palette_decoded_count(len(palette_values)),
        )
    else:
        fields = ""
    lines.extend([
        "",
        f"constexpr gbs::PaletteAsset {name}_palette_asset = {{ {name}_palette, {len(palette_values)}, 0{fields} }};",
    ])
    return "\n".join(lines)


def emit_indexed_background_header(name, width, height, colors, indices, max_source_tiles=1024):
    """Emit a ROM source atlas for the isometric 8bpp viewport compositor."""
    tiles, tilemap_entries, tilemap_width, tilemap_height = build_indexed_background_tiles(
        width, height, indices, max_source_tiles=max_source_tiles
    )
    palette_values = [rgb15(c) for c in colors]
    lines = [
        "#pragma once",
        "#include <stdint.h>",
        "#include \"gbs/assets.hpp\"",
        "",
        f"constexpr int {name}_width = {width};",
        f"constexpr int {name}_height = {height};",
        f"constexpr int {name}_tilemap_width = {tilemap_width};",
        f"constexpr int {name}_tilemap_height = {tilemap_height};",
        f"constexpr int {name}_tile_count = {len(tiles)};",
        f"constexpr uint16_t {name}_palette[{len(palette_values)}] = {{ {', '.join(hex(v) for v in palette_values)} }};",
        f"alignas(2) constexpr uint8_t {name}_tiles[{len(tiles)}][64] = {{",
    ]
    for tile in tiles:
        lines.append("    { " + ", ".join(hex(v) for v in tile) + " },")
    lines.extend([
        "};",
        "",
        f"constexpr uint16_t {name}_tilemap_entries[{len(tilemap_entries)}] = {{ {', '.join(hex(v) for v in tilemap_entries)} }};",
        f"constexpr gbs::PaletteAsset {name}_palette_asset = {{ {name}_palette, {len(palette_values)}, 0 }};",
        f"const gbs::TileAsset {name}_tile_asset = {{ reinterpret_cast<const uint8_t*>({name}_tiles), {name}_tile_count, 0, false, gbs::ColorDepth::Bpp8 }};",
        f"constexpr gbs::TileMapAsset {name}_tilemap_asset = {{ {name}_tilemap_entries, {name}_tilemap_width, {name}_tilemap_height }};",
        "",
    ])
    return "\n".join(lines)


def emit_sprite_header(
    name,
    width,
    height,
    colors,
    indices,
    destination_tile,
    palette_bank,
    sprite_width,
    sprite_height,
    frame_duration,
    lz77_palette,
    stream_frames=False,
    sprite_bpp=4,
    huffman_palette=False,
    compression_policy=None,
    palette_count_override=None,
):
    if sprite_bpp not in (4, 8):
        raise SystemExit("sprite_bpp suporta somente 4 ou 8")
    if destination_tile < 0 or destination_tile >= 1024:
        raise SystemExit("--destination-tile precisa estar entre 0 e 1023")
    if palette_bank < 0 or palette_bank > 15:
        raise SystemExit("--palette-bank precisa estar entre 0 e 15")
    if sprite_bpp == 8 and palette_bank != 0:
        raise SystemExit("sprite_bpp 8 exige palette_bank 0 porque OBJ 8bpp usa uma paleta de 256 cores")
    if frame_duration <= 0 or frame_duration > 255:
        raise SystemExit("--frame-duration precisa estar entre 1 e 255")

    sprite_plan = build_sprite_tile_plan(width, height, indices, sprite_width, sprite_height, sprite_bpp)
    tiles = sprite_plan["tiles"]
    frame_tiles = sprite_plan["frame_tiles"]
    frame_count = sprite_plan["frame_count"]
    frame_columns = sprite_plan["frame_columns"]
    resident_tile_count = max(sprite_plan["frame_tile_counts"]) if stream_frames else len(tiles)
    tile_stride = 2 if sprite_bpp == 8 else 1
    if destination_tile % tile_stride != 0 or destination_tile + resident_tile_count * tile_stride > 1024:
        raise SystemExit("tiles de sprite excedem o limite de 1024 tiles a partir do destino informado")

    palette_count = palette_count_override if palette_count_override is not None else 256 if sprite_bpp == 8 else 16
    if not isinstance(palette_count, int) or palette_count < 1 or palette_count > (256 if sprite_bpp == 8 else 16):
        raise SystemExit("palette_count invalido para OBJ")
    palette_values = [rgb15(c) for c in colors]
    if len(palette_values) > palette_count:
        raise SystemExit(f"sprite_bpp {sprite_bpp} suporta no maximo {palette_count} cores")
    palette_values.extend([0] * (palette_count - len(palette_values)))
    selected_compression = single_compression_flag(("lz77", lz77_palette), ("huffman", huffman_palette))
    if compression_policy is not None:
        selected = resolve_pack_compression_policy(compression_policy, "obj", palette_values=palette_values)
        lz77_palette = selected["palette"] == "lz77"
        huffman_palette = selected["palette"] == "huffman"
        selected_compression = selected["palette"]
    parts = sprite_plan["parts"]
    parts_per_frame = len(parts)
    object_literal = "true"
    includes = [
        "#include <stdint.h>",
        "#include \"gbs/assets.hpp\"",
    ]
    if selected_compression != "none":
        includes.append("#include \"gbs/compression.hpp\"")
    lines = [
        "#pragma once",
        *includes,
        "",
        f"constexpr int {name}_width = {width};",
        f"constexpr int {name}_height = {height};",
        f"constexpr int {name}_sprite_width = {sprite_width};",
        f"constexpr int {name}_sprite_height = {sprite_height};",
        f"constexpr int {name}_frame_count = {frame_count};",
        f"constexpr int {name}_frame_columns = {frame_columns};",
        f"constexpr int {name}_tile_count = {resident_tile_count};",
        f"constexpr uint16_t {name}_palette[{palette_count}] = {{ {', '.join(hex(v) for v in palette_values)} }};",
        f"alignas(2) constexpr uint8_t {name}_tiles[{resident_tile_count}][{32 * tile_stride}] = {{",
    ]
    resident_tiles = frame_tiles[0] if stream_frames else tiles
    resident_tiles = resident_tiles + [[0] * (32 * tile_stride) for _ in range(resident_tile_count - len(resident_tiles))]
    for tile in resident_tiles:
        lines.append("    { " + ", ".join(hex(v) for v in tile) + " },")
    lines.append("};")
    lines.extend([
        "",
        f"const gbs::TileAsset {name}_tile_asset = {{ reinterpret_cast<const uint8_t*>({name}_tiles), {name}_tile_count, {destination_tile}, {object_literal}{', gbs::ColorDepth::Bpp8' if sprite_bpp == 8 else ''} }};",
        "",
    ])
    if stream_frames:
        for frame, frame_data in enumerate(frame_tiles):
            lines.extend([
                f"alignas(2) constexpr uint8_t {name}_frame_{frame}_tiles[{len(frame_data)}][{32 * tile_stride}] = {{",
            ])
            for tile in frame_data:
                lines.append("    { " + ", ".join(hex(v) for v in tile) + " },")
            lines.extend([
                "};",
                f"const gbs::TileAsset {name}_frame_{frame}_tile_asset = {{ reinterpret_cast<const uint8_t*>({name}_frame_{frame}_tiles), {len(frame_data)}, {destination_tile}, {object_literal}{', gbs::ColorDepth::Bpp8' if sprite_bpp == 8 else ''} }};",
                "",
            ])
    if lz77_palette:
        lines.extend(build_lz77_palette_lines(name, palette_values, 0 if sprite_bpp == 8 else palette_bank * 16))
    if huffman_palette:
        lines.extend(build_huffman_palette_lines(name, palette_values, 0 if sprite_bpp == 8 else palette_bank * 16))
    if selected_compression == "lz77":
        fields = primary_asset_compression_fields(
            selected_compression,
            f"{name}_lz77_palette_data",
            f"{name}_lz77_palette_size",
            len(palette_values) * 2,
        )
    elif selected_compression == "huffman":
        fields = primary_asset_compression_fields(
            selected_compression,
            f"{name}_huffman_palette_data",
            f"{name}_huffman_palette_size",
            huffman_palette_decoded_count(len(palette_values)),
        )
    else:
        fields = ""
    lines.extend([
        "",
        f"constexpr gbs::PaletteAsset {name}_palette_asset = {{ {name}_palette, {palette_count}, {0 if sprite_bpp == 8 else palette_bank * 16}{fields} }};",
    ])

    for frame in range(frame_count):
        lines.append(f"constexpr gbs::MetaSpritePart {name}_frame_{frame}_parts[{parts_per_frame}] = {{")
        frame_parts = sprite_plan["stream_frame_parts"] if stream_frames else sprite_plan["frame_parts"]
        for (part_x, part_y, part_width, part_height), optimized in zip(parts, frame_parts[frame]):
            tile_index = destination_tile + optimized["tile_offset"] * tile_stride
            hflip = "true" if optimized["hflip"] else "false"
            lines.append(
                f"    {{ {part_x}, {part_y}, {tile_index}, {0 if sprite_bpp == 8 else palette_bank}, "
                f"{hflip}, false, {part_width}, {part_height}"
                f"{', gbs::ColorDepth::Bpp8' if sprite_bpp == 8 else ''} }},"
            )
        lines.append("};")
    lines.append("")
    lines.append(f"constexpr gbs::MetaSprite {name}_metasprites[{frame_count}] = {{")
    for frame in range(frame_count):
        lines.append(f"    {{ {name}_frame_{frame}_parts, {parts_per_frame} }},")
    lines.append("};")
    lines.append("")
    lines.append(f"constexpr gbs::SpriteAnimationFrame {name}_animation_frames[{frame_count}] = {{")
    for frame in range(frame_count):
        streamed_asset = f", &{name}_frame_{frame}_tile_asset" if stream_frames else ""
        lines.append(f"    {{ {name}_metasprites[{frame}], {frame_duration}{streamed_asset} }},")
    lines.append("};")
    lines.append(f"constexpr gbs::SpriteAnimation {name}_animation = {{ {name}_animation_frames, {frame_count}, true }};")
    lines.append("")
    return "\n".join(lines)


def require_int(value, label, minimum, maximum):
    if not isinstance(value, int) or value < minimum or value > maximum:
        raise SystemExit(f"{label} precisa estar entre {minimum} e {maximum}")
    return value


def filtered_resample(samples, source_rate, output_rate, radius=12):
    if output_rate == source_rate:
        return list(samples)
    output_count = max(1, int(round(len(samples) * output_rate / source_rate)))
    cutoff = min(1.0, output_rate / source_rate) * 0.94
    output = []
    for output_index in range(output_count):
        source_position = (output_index + 0.5) * source_rate / output_rate - 0.5
        center = int(math.floor(source_position))
        weighted = 0.0
        weight_total = 0.0
        for source_index in range(center - radius + 1, center + radius + 1):
            if source_index < 0 or source_index >= len(samples):
                continue
            distance = source_position - source_index
            if abs(distance) >= radius:
                continue
            sinc_input = math.pi * distance * cutoff
            sinc = 1.0 if abs(sinc_input) < 1e-12 else math.sin(sinc_input) / sinc_input
            window = 0.5 + 0.5 * math.cos(math.pi * distance / radius)
            weight = cutoff * sinc * window
            weighted += samples[source_index] * weight
            weight_total += weight
        output.append(weighted / weight_total if abs(weight_total) > 1e-12 else 0.0)
    return output


def pcm8_with_headroom(samples):
    converted = []
    for sample in samples:
        value = max(-1.0, min(1.0, float(sample))) * 0.9
        magnitude = abs(value)
        if magnitude > 0.82:
            magnitude = 0.82 + 0.18 * math.tanh((magnitude - 0.82) / 0.18)
        limited = math.copysign(magnitude, value)
        converted.append(max(-128, min(127, int(round(limited * 127.0)))))
    return converted


def convert_wav_to_pcm8(path, target_sample_rate=None):
    try:
        with wave.open(str(path), "rb") as wav:
            channels = wav.getnchannels()
            sample_width = wav.getsampwidth()
            source_rate = wav.getframerate()
            frame_count = wav.getnframes()
            compression = wav.getcomptype()
            frames = wav.readframes(frame_count)
    except (wave.Error, OSError) as exc:
        raise SystemExit(f"{path}: WAV invalido ou ilegivel") from exc

    if compression != "NONE":
        raise SystemExit("WAV precisa ser PCM sem compressao")
    if channels <= 0 or channels > 2:
        raise SystemExit("WAV suporta mono ou stereo nesta versao")
    if sample_width not in (1, 2):
        raise SystemExit("WAV suporta samples 8-bit ou 16-bit PCM nesta versao")
    if frame_count <= 0:
        raise SystemExit("WAV precisa conter samples")

    mono = []
    if sample_width == 1:
        for frame in range(frame_count):
            base = frame * channels
            total = 0
            for channel in range(channels):
                total += (frames[base + channel] - 128) / 128.0
            mono.append(total / channels)
    else:
        for frame in range(frame_count):
            base = frame * channels * 2
            total = 0
            for channel in range(channels):
                start = base + channel * 2
                total += struct.unpack_from("<h", frames, start)[0] / 32768.0
            mono.append(total / channels)

    # Match the GBA mixer's timer clock for automatic WAV exports. Explicit
    # rates and low-rate sources retain their selected size/quality tradeoff.
    output_rate = target_sample_rate if target_sample_rate is not None else min(source_rate, 31536)
    output_rate = require_int(output_rate, "sample_rate_hz", 4000, 32768)
    if source_rate <= 0:
        raise SystemExit("WAV precisa ter sample rate valido")

    samples = pcm8_with_headroom(filtered_resample(mono, source_rate, output_rate))

    if len(samples) > 0xFFFF:
        raise SystemExit("PCM gerado excede 65535 samples; divida ou reduza o asset")

    return samples, output_rate, 0, 0


MOD_SIGNATURE_CHANNELS = {
    b"M.K.": 4,
    b"M!K!": 4,
    b"4CHN": 4,
    b"FLT4": 4,
}


def read_mod_header(path):
    data = Path(path).read_bytes()
    if len(data) < 1084:
        raise SystemExit(f"{path}: MOD muito pequeno")

    signature = data[1080:1084]
    if signature not in MOD_SIGNATURE_CHANNELS:
        raise SystemExit(f"{path}: MOD ProTracker 4 canais nao suportado ou assinatura ausente")

    sample_headers = []
    for sample_index in range(31):
        sample_offset = 20 + sample_index * 30
        sample_name = data[sample_offset:sample_offset + 22].split(b"\0", 1)[0].decode("ascii", "ignore")
        sample_length = struct.unpack_from(">H", data, sample_offset + 22)[0] * 2
        sample_finetune = data[sample_offset + 24] & 0x0F
        if sample_finetune >= 8:
            sample_finetune -= 16
        sample_volume = data[sample_offset + 25]
        repeat_offset = struct.unpack_from(">H", data, sample_offset + 26)[0] * 2
        repeat_length = struct.unpack_from(">H", data, sample_offset + 28)[0] * 2
        sample_headers.append({
            "name": sample_name,
            "length": sample_length,
            "finetune": sample_finetune,
            "volume": sample_volume,
            "repeat_offset": repeat_offset,
            "repeat_length": repeat_length,
        })

    song_length = data[950]
    if song_length <= 0 or song_length > 128:
        raise SystemExit(f"{path}: order length MOD invalido")
    order = list(data[952:952 + song_length])
    pattern_count = max(order) + 1
    channel_count = MOD_SIGNATURE_CHANNELS[signature]
    pattern_size = 64 * channel_count * 4
    pattern_data_offset = 1084
    pattern_data_size = pattern_count * pattern_size
    sample_data_offset = pattern_data_offset + pattern_data_size
    if len(data) < sample_data_offset:
        raise SystemExit(f"{path}: dados de pattern MOD incompletos")

    return {
        "data": data,
        "channel_count": channel_count,
        "sample_headers": sample_headers,
        "song_length": song_length,
        "order": order,
        "pattern_count": pattern_count,
        "pattern_size": pattern_size,
        "pattern_data_offset": pattern_data_offset,
        "sample_data_offset": sample_data_offset,
    }


def convert_mod_sample_to_pcm8(path, sample_index, target_sample_rate=None):
    info = read_mod_header(path)
    index = require_int(sample_index, "sample_index", 1, 31) - 1
    sample_header = info["sample_headers"][index]
    if sample_header["length"] <= 0:
        raise SystemExit(f"{path}: sample MOD {index + 1} esta vazio")

    sample_offset = info["sample_data_offset"]
    for previous in info["sample_headers"][:index]:
        sample_offset += previous["length"]
    sample_end = sample_offset + sample_header["length"]
    if len(info["data"]) < sample_end:
        raise SystemExit(f"{path}: dados do sample MOD {index + 1} incompletos")

    samples = []
    for value in info["data"][sample_offset:sample_end]:
        samples.append(value - 256 if value >= 128 else value)
    if len(samples) > 0xFFFF:
        raise SystemExit("PCM gerado excede 65535 samples; divida ou reduza o asset")

    sample_rate = target_sample_rate if target_sample_rate is not None else 8363
    sample_rate = require_int(sample_rate, "sample_rate_hz", 4000, 32768)
    loop_start = sample_header["repeat_offset"] if sample_header["repeat_length"] > 2 else 0
    loop_end = min(sample_header["length"], loop_start + sample_header["repeat_length"]) if loop_start > 0 or sample_header["repeat_length"] > 2 else 0
    if loop_end <= loop_start:
        loop_start = 0
        loop_end = 0
    return samples, sample_rate, loop_start, loop_end


def mod_period_to_frequency(period):
    if period <= 0:
        return 0
    frequency = int(round(7093789 / (period * 2)))
    return clamp_tracker_frequency(frequency)


def transpose_frequency(frequency, semitones):
    if frequency <= 0:
        return 0
    return clamp_tracker_frequency(int(round(frequency * math.pow(2.0, semitones / 12.0))))


def apply_mod_finetune(frequency, finetune):
    return transpose_frequency(frequency, finetune / 8.0)


def tracker_row_duration_from_tempo(speed, tempo_bpm):
    if tempo_bpm <= 0:
        return max(1, min(255, int(speed)))
    return max(1, min(255, int(round(speed * 150 / tempo_bpm))))


def append_tracker_step(steps, channel, frequency, duration, volume, duty):
    steps.append({
        "channel": channel,
        "frequency_hz": clamp_tracker_frequency(int(frequency)),
        "duration_frames": max(1, min(255, int(duration))),
        "volume": max(0, min(15, int(volume))),
        "duty": duty,
    })


def append_portamento_steps(steps, channel, start_frequency, target_frequency, duration, volume, duty):
    if start_frequency <= 0 or start_frequency == target_frequency:
        append_tracker_step(steps, channel, target_frequency, duration, volume, duty)
        return
    slices = max(1, min(8, duration))
    base_duration = max(1, duration // slices)
    remaining = duration
    for slice_index in range(slices):
        current_duration = base_duration if slice_index < slices - 1 else remaining
        fraction = 1.0 if slices == 1 else slice_index / (slices - 1)
        frequency = int(round(start_frequency + (target_frequency - start_frequency) * fraction))
        append_tracker_step(steps, channel, frequency, current_duration, volume, duty)
        remaining -= current_duration


def append_vibrato_steps(steps, channel, frequency, duration, volume, duty, parameter):
    speed = (parameter >> 4) & 0x0F
    depth = parameter & 0x0F
    if speed == 0 or depth == 0:
        append_tracker_step(steps, channel, frequency, duration, volume, duty)
        return

    slices = max(1, min(8, duration))
    base_duration = max(1, duration // slices)
    remaining = duration
    for slice_index in range(slices):
        current_duration = base_duration if slice_index < slices - 1 else remaining
        phase = slice_index * max(1, speed) / 8.0
        semitone_offset = math.sin(phase * math.tau) * depth / 32.0
        append_tracker_step(
            steps,
            channel,
            transpose_frequency(frequency, semitone_offset),
            current_duration,
            volume,
            duty,
        )
        remaining -= current_duration


def append_tremolo_steps(steps, channel, frequency, duration, volume, duty, parameter):
    speed = (parameter >> 4) & 0x0F
    depth = parameter & 0x0F
    if speed == 0 or depth == 0:
        append_tracker_step(steps, channel, frequency, duration, volume, duty)
        return

    slices = max(1, min(8, duration))
    base_duration = max(1, duration // slices)
    remaining = duration
    for slice_index in range(slices):
        current_duration = base_duration if slice_index < slices - 1 else remaining
        phase = slice_index * max(1, speed) / 8.0
        volume_offset = int(round(math.sin(phase * math.tau) * depth / 2.0))
        append_tracker_step(
            steps,
            channel,
            frequency,
            current_duration,
            max(0, min(15, volume + volume_offset)),
            duty,
        )
        remaining -= current_duration


def resolve_tracker_order(order, pattern_controls):
    resolved = []
    order_index = 0
    visited = set()
    max_entries = max(1, len(order) * 4)

    while order_index < len(order) and len(resolved) < max_entries:
        state = order_index
        if state in visited:
            break
        visited.add(state)

        pattern_index = order[order_index]
        resolved.append(pattern_index)
        control = pattern_controls.get(pattern_index, {})
        jump_order = control.get("jump_order")
        if jump_order is not None:
            if 0 <= jump_order < len(order):
                order_index = jump_order
                continue
            break
        order_index += 1

    return resolved if resolved else order


def append_mod_effect_steps(steps, note, duration, duty):
    effect = note.get("effect", 0)
    parameter = note.get("parameter", 0)
    channel = note["channel"]
    frequency = note["frequency_hz"]
    volume = note["volume"]

    if effect == 0x3:
        append_portamento_steps(
            steps,
            channel,
            note.get("previous_frequency_hz", 0),
            frequency,
            duration,
            volume,
            duty,
        )
        return

    if effect == 0x4:
        append_vibrato_steps(steps, channel, frequency, duration, volume, duty, parameter)
        return

    if effect == 0x7:
        append_tremolo_steps(steps, channel, frequency, duration, volume, duty, parameter)
        return

    if effect == 0x0 and parameter != 0:
        offsets = [0, (parameter >> 4) & 0x0F, parameter & 0x0F]
        remaining = duration
        offset_index = 0
        while remaining > 0:
            step_duration = 1 if duration <= 24 else min(4, remaining)
            append_tracker_step(
                steps,
                channel,
                transpose_frequency(frequency, offsets[offset_index % len(offsets)]),
                min(step_duration, remaining),
                volume,
                duty,
            )
            remaining -= step_duration
            offset_index += 1
        return

    if effect == 0x1 or effect == 0x2:
        slices = max(1, min(8, duration))
        base_duration = max(1, duration // slices)
        remaining = duration
        direction = 1 if effect == 0x1 else -1
        for slice_index in range(slices):
            current_duration = base_duration if slice_index < slices - 1 else remaining
            semitone_offset = direction * max(0, parameter) * slice_index / max(1, slices - 1) / 8.0
            append_tracker_step(
                steps,
                channel,
                transpose_frequency(frequency, semitone_offset),
                current_duration,
                volume,
                duty,
            )
            remaining -= current_duration
        return

    if effect == 0xA:
        up = (parameter >> 4) & 0x0F
        down = parameter & 0x0F
        volume = max(0, min(15, volume + up - down))

    append_tracker_step(steps, channel, frequency, duration, volume, duty)


def append_s3m_effect_steps(steps, note, duration, duty):
    command = note.get("command", 0)
    parameter = note.get("parameter", 0)
    channel = note["channel"]
    frequency = note["frequency_hz"]
    volume = note["volume"]

    if command == 7:
        append_portamento_steps(
            steps,
            channel,
            note.get("previous_frequency_hz", 0),
            frequency,
            duration,
            volume,
            duty,
        )
        return

    if command == 8:
        append_vibrato_steps(steps, channel, frequency, duration, volume, duty, parameter)
        return

    if command == 18:
        append_tremolo_steps(steps, channel, frequency, duration, volume, duty, parameter)
        return

    if command == 4:
        up = (parameter >> 4) & 0x0F
        down = parameter & 0x0F
        volume = max(0, min(15, volume + up - down))

    if command == 5 or command == 6:
        slices = max(1, min(8, duration))
        base_duration = max(1, duration // slices)
        remaining = duration
        direction = -1 if command == 5 else 1
        for slice_index in range(slices):
            current_duration = base_duration if slice_index < slices - 1 else remaining
            semitone_offset = direction * max(0, parameter) * slice_index / max(1, slices - 1) / 8.0
            append_tracker_step(
                steps,
                channel,
                transpose_frequency(frequency, semitone_offset),
                current_duration,
                volume,
                duty,
            )
            remaining -= current_duration
        return

    append_tracker_step(steps, channel, frequency, duration, volume, duty)


def clamp_tracker_frequency(frequency):
    if frequency < 64:
        return 64
    if frequency > 4095:
        return 4095
    return frequency


def s3m_note_to_frequency(note):
    if note >= 254:
        return 0
    semitone = note & 0x0F
    octave = note >> 4
    if semitone > 11 or octave > 9:
        return 0
    midi_note = 12 + octave * 12 + semitone
    frequency = int(round(440.0 * math.pow(2.0, (midi_note - 69) / 12.0)))
    return clamp_tracker_frequency(frequency)


def read_s3m_header(path):
    data = Path(path).read_bytes()
    if len(data) < 0x60:
        raise SystemExit(f"{path}: S3M muito pequeno")
    if data[0x2C:0x30] != b"SCRM":
        raise SystemExit(f"{path}: assinatura S3M ausente")

    order_count, instrument_count, pattern_count = struct.unpack_from("<HHH", data, 0x20)
    if order_count <= 0 or order_count > 256:
        raise SystemExit(f"{path}: order length S3M invalido")
    if instrument_count < 0 or instrument_count > 256:
        raise SystemExit(f"{path}: instrument count S3M invalido")
    if pattern_count <= 0 or pattern_count > 256:
        raise SystemExit(f"{path}: pattern count S3M invalido")

    table_offset = 0x60
    instrument_table_offset = table_offset + order_count
    pattern_table_offset = instrument_table_offset + instrument_count * 2
    if len(data) < pattern_table_offset + pattern_count * 2:
        raise SystemExit(f"{path}: tabelas S3M incompletas")

    raw_order = list(data[table_offset:table_offset + order_count])
    order = [entry for entry in raw_order if entry < pattern_count]
    if not order:
        raise SystemExit(f"{path}: order S3M nao referencia patterns validos")

    instrument_parapointers = [
        struct.unpack_from("<H", data, instrument_table_offset + instrument_index * 2)[0]
        for instrument_index in range(instrument_count)
    ]
    pattern_parapointers = [
        struct.unpack_from("<H", data, pattern_table_offset + pattern_index * 2)[0]
        for pattern_index in range(pattern_count)
    ]

    return {
        "data": data,
        "order_count": order_count,
        "instrument_count": instrument_count,
        "pattern_count": pattern_count,
        "order": order,
        "instrument_parapointers": instrument_parapointers,
        "pattern_parapointers": pattern_parapointers,
    }


def read_s3m_instrument_volumes(info, path, fallback_volume):
    volumes = [fallback_volume] * info["instrument_count"]
    for instrument_index, parapointer in enumerate(info["instrument_parapointers"]):
        instrument_offset = parapointer * 16
        if instrument_offset == 0:
            continue
        if len(info["data"]) < instrument_offset + 80:
            raise SystemExit(f"{path}: instrumento S3M {instrument_index + 1} invalido")
        if info["data"][instrument_offset] != 1:
            continue
        if info["data"][instrument_offset + 76:instrument_offset + 80] != b"SCRS":
            raise SystemExit(f"{path}: assinatura de sample S3M ausente")
        volumes[instrument_index] = max(0, min(15, info["data"][instrument_offset + 28] // 4))
    return volumes


def convert_s3m_sample_to_pcm8(path, instrument_index, target_sample_rate=None):
    info = read_s3m_header(path)
    index = require_int(instrument_index, "instrument_index", 1, max(1, info["instrument_count"])) - 1
    if index >= info["instrument_count"]:
        raise SystemExit(f"{path}: instrumento S3M {index + 1} nao existe")
    instrument_offset = info["instrument_parapointers"][index] * 16
    if instrument_offset == 0 or len(info["data"]) < instrument_offset + 80:
        raise SystemExit(f"{path}: instrumento S3M {index + 1} invalido")

    instrument_type = info["data"][instrument_offset]
    if instrument_type != 1:
        raise SystemExit(f"{path}: instrumento S3M {index + 1} nao e sample PCM")
    sample_paragraph = (
        info["data"][instrument_offset + 13] |
        (info["data"][instrument_offset + 14] << 8) |
        (info["data"][instrument_offset + 15] << 16)
    )
    sample_offset = sample_paragraph * 16
    sample_length = struct.unpack_from("<I", info["data"], instrument_offset + 16)[0]
    loop_begin = struct.unpack_from("<I", info["data"], instrument_offset + 20)[0]
    loop_end = struct.unpack_from("<I", info["data"], instrument_offset + 24)[0]
    sample_rate = struct.unpack_from("<I", info["data"], instrument_offset + 32)[0]
    flags = info["data"][instrument_offset + 31]
    signature = info["data"][instrument_offset + 76:instrument_offset + 80]
    if signature != b"SCRS":
        raise SystemExit(f"{path}: assinatura de sample S3M ausente")
    if sample_length <= 0:
        raise SystemExit(f"{path}: sample S3M {index + 1} esta vazio")
    is_stereo = bool(flags & 0x02)
    is_16_bit = bool(flags & 0x04)
    channel_count = 2 if is_stereo else 1
    bytes_per_sample = 2 if is_16_bit else 1
    byte_count = sample_length * channel_count * bytes_per_sample
    if len(info["data"]) < sample_offset + byte_count:
        raise SystemExit(f"{path}: dados do sample S3M {index + 1} incompletos")

    samples = []
    for frame_index in range(sample_length):
        channel_values = []
        frame_offset = sample_offset + frame_index * channel_count * bytes_per_sample
        for channel in range(channel_count):
            channel_offset = frame_offset + channel * bytes_per_sample
            if is_16_bit:
                value = struct.unpack_from("<h", info["data"], channel_offset)[0] // 256
            else:
                value = info["data"][channel_offset] - 128
            channel_values.append(value)
        samples.append(sum(channel_values) // len(channel_values))
    if len(samples) > 0xFFFF:
        raise SystemExit("PCM gerado excede 65535 samples; divida ou reduza o asset")

    output_rate = target_sample_rate if target_sample_rate is not None else sample_rate
    output_rate = require_int(output_rate, "sample_rate_hz", 4000, 32768)
    if not bool(flags & 0x01) or loop_begin >= loop_end or loop_end > sample_length:
        loop_begin = 0
        loop_end = 0
    return samples, output_rate, loop_begin, loop_end


def resolve_pcm_loop(asset, samples, auto_loop_start, auto_loop_end):
    explicit_loop = asset.get("loop")
    loop = bool(explicit_loop) if explicit_loop is not None else auto_loop_end > auto_loop_start
    loop_start = asset.get("loop_start_sample", auto_loop_start if loop else 0)
    loop_end = asset.get("loop_end_sample", auto_loop_end if loop else 0)
    loop_start = require_int(loop_start, "loop_start_sample", 0, len(samples))
    loop_end = require_int(loop_end, "loop_end_sample", 0, len(samples))
    if loop and loop_end == 0:
        loop_end = len(samples)
    if loop and not loop_start < loop_end:
        raise SystemExit("loop_start_sample precisa ser menor que loop_end_sample")
    if not loop:
        loop_start = 0
        loop_end = 0
    return loop, loop_start, loop_end


def frames_from_vgm_samples(sample_count):
    frames = int(round(sample_count / 735.0))
    if frames < 1:
        return 1
    if frames > 255:
        return 255
    return frames


def sn76489_noise_frequency(noise_control, tone2_period, clock):
    rate = noise_control & 0x03
    if rate == 0:
        return 512
    if rate == 1:
        return 1024
    if rate == 2:
        return 2048
    if tone2_period > 0:
        return clamp_tracker_frequency(int(round(clock / (32 * tone2_period))))
    return 1024


def append_vgm_note(notes, frame, channel, frequency, volume):
    note = {
        "frame": frame,
        "channel": channel,
        "frequency_hz": frequency,
        "volume": volume,
    }
    if notes and notes[-1]["frame"] == frame and notes[-1]["channel"] == channel:
        notes[-1] = note
    else:
        notes.append(note)


def parse_mod_tracker(path, row_duration_frames=4, volume=8, duty=2):
    info = read_mod_header(path)
    data = info["data"]
    channel_count = info["channel_count"]
    sample_volumes = [
        max(0, min(15, sample["volume"] // 4))
        for sample in info["sample_headers"]
    ]
    sample_finetunes = [
        sample["finetune"]
        for sample in info["sample_headers"]
    ]
    order = info["order"]
    pattern_count = info["pattern_count"]
    pattern_size = info["pattern_size"]
    pattern_data_offset = info["pattern_data_offset"]
    sample_asset_indexes = {}
    tracker_samples = []
    for sample_index, sample_header in enumerate(info["sample_headers"]):
        if sample_header["length"] <= 0:
            continue
        samples, sample_rate, loop_start, loop_end = convert_mod_sample_to_pcm8(path, sample_index + 1)
        sample_asset_indexes[sample_index + 1] = len(tracker_samples)
        tracker_samples.append({
            "samples": samples,
            "sample_rate_hz": sample_rate,
            "loop_start_sample": loop_start,
            "loop_end_sample": loop_end,
        })

    tracker_speed = require_int(row_duration_frames, "row_duration_frames", 1, 255)
    row_duration = tracker_speed
    fallback_volume = require_int(volume, "volume", 0, 15)
    step_duty = require_int(duty, "duty", 0, 3)
    patterns = []
    pattern_controls = {}

    for pattern_index in range(pattern_count):
        pattern_offset = pattern_data_offset + pattern_index * pattern_size
        channel_last_frequencies = [0] * channel_count
        note_rows = []
        pattern_end_row = 64
        for row in range(64):
            row_offset = pattern_offset + row * channel_count * 4
            for channel in range(channel_count):
                event_offset = row_offset + channel * 4
                b0, b1, b2, b3 = data[event_offset:event_offset + 4]
                sample_number = (b0 & 0xF0) | (b2 >> 4)
                period = ((b0 & 0x0F) << 8) | b1
                effect = b2 & 0x0F
                parameter = b3
                if effect == 0xB:
                    if pattern_index not in pattern_controls:
                        pattern_controls[pattern_index] = {
                            "end_row": row,
                            "jump_order": parameter,
                        }
                        pattern_end_row = min(pattern_end_row, row)
                    continue
                if effect == 0xD:
                    if pattern_index not in pattern_controls:
                        pattern_controls[pattern_index] = {
                            "end_row": row,
                        }
                        pattern_end_row = min(pattern_end_row, row)
                    continue
                if effect == 0xF and parameter > 0:
                    if parameter <= 32:
                        tracker_speed = max(1, min(255, parameter))
                        row_duration = tracker_speed
                    else:
                        row_duration = tracker_row_duration_from_tempo(tracker_speed, parameter)
                if period == 0:
                    continue
                frequency = mod_period_to_frequency(period)
                if frequency > 0:
                    note_volume = fallback_volume
                    note_finetune = 0
                    if sample_number > 0 and sample_number <= len(sample_volumes):
                        note_volume = sample_volumes[sample_number - 1]
                        note_finetune = sample_finetunes[sample_number - 1]
                    if effect == 0xC:
                        note_volume = max(0, min(15, parameter // 4))
                    tuned_frequency = apply_mod_finetune(frequency, note_finetune)
                    note_rows.append({
                        "row": row,
                        "channel": 1 + (channel % 4),
                        "frequency_hz": tuned_frequency,
                        "previous_frequency_hz": channel_last_frequencies[channel],
                        "volume": note_volume,
                        "row_duration": row_duration,
                        "effect": effect,
                        "parameter": parameter,
                        "sample_index": sample_asset_indexes.get(sample_number, -1),
                        "sample_rate_hz": max(1, min(32768, int(round(7093789 / (period * 2))))),
                    })
                    channel_last_frequencies[channel] = tuned_frequency

        note_rows = [note for note in note_rows if note["row"] < pattern_end_row]
        steps = []
        if not note_rows:
            steps.append({
                "channel": 2,
                "frequency_hz": 64,
                "duration_frames": min(255, 64 * row_duration),
                "volume": 0,
                "duty": step_duty,
            })
        else:
            row_numbers = sorted(set(note["row"] for note in note_rows))
            for row_index, row_number in enumerate(row_numbers):
                row_notes = [note for note in note_rows if note["row"] == row_number]
                next_row = row_numbers[row_index + 1] if row_index + 1 < len(row_numbers) else pattern_end_row
                duration = max(1, min(255, (next_row - row_number) * row_notes[0]["row_duration"]))
                if len(row_notes) == 1:
                    start_index = len(steps)
                    append_mod_effect_steps(steps, row_notes[0], duration, step_duty)
                    steps[start_index]["sample_index"] = row_notes[0]["sample_index"]
                    steps[start_index]["sample_rate_hz"] = row_notes[0]["sample_rate_hz"]
                    continue
                for note_index, note in enumerate(row_notes):
                    note_steps = []
                    append_mod_effect_steps(note_steps, note, duration, step_duty)
                    simultaneous = note_steps[0]
                    simultaneous["duration_frames"] = duration if note_index == len(row_notes) - 1 else 0
                    simultaneous["sample_index"] = note["sample_index"]
                    simultaneous["sample_rate_hz"] = note["sample_rate_hz"]
                    steps.append(simultaneous)
        patterns.append({ "steps": steps })

    return {
        "patterns": patterns,
        "order": resolve_tracker_order(order, pattern_controls),
        "samples": tracker_samples,
    }


def parse_s3m_tracker(path, row_duration_frames=4, volume=8, duty=2):
    info = read_s3m_header(path)
    data = info["data"]
    order = info["order"]
    pattern_count = info["pattern_count"]
    pattern_parapointers = info["pattern_parapointers"]

    base_row_duration = require_int(row_duration_frames, "row_duration_frames", 1, 255)
    fallback_volume = require_int(volume, "volume", 0, 15)
    instrument_volumes = read_s3m_instrument_volumes(info, path, fallback_volume)
    instrument_sample_rates = [8363] * info["instrument_count"]
    sample_asset_indexes = {}
    tracker_samples = []
    for instrument_index, parapointer in enumerate(info["instrument_parapointers"]):
        instrument_offset = parapointer * 16
        if instrument_offset == 0 or len(data) < instrument_offset + 80 or data[instrument_offset] != 1:
            continue
        sample_length = struct.unpack_from("<I", data, instrument_offset + 16)[0]
        if sample_length <= 0:
            continue
        instrument_sample_rates[instrument_index] = struct.unpack_from("<I", data, instrument_offset + 32)[0]
        samples, sample_rate, loop_start, loop_end = convert_s3m_sample_to_pcm8(path, instrument_index + 1)
        sample_asset_indexes[instrument_index + 1] = len(tracker_samples)
        tracker_samples.append({
            "samples": samples,
            "sample_rate_hz": sample_rate,
            "loop_start_sample": loop_start,
            "loop_end_sample": loop_end,
        })
    step_duty = require_int(duty, "duty", 0, 3)
    patterns = []
    pattern_controls = {}

    for pattern_index, parapointer in enumerate(pattern_parapointers):
        pattern_offset = parapointer * 16
        if pattern_offset == 0:
            patterns.append({
                "steps": [{
                    "channel": 2,
                    "frequency_hz": 64,
                    "duration_frames": min(255, 64 * base_row_duration),
                    "volume": 0,
                    "duty": step_duty,
                }]
            })
            continue
        if len(data) < pattern_offset + 2:
            raise SystemExit(f"{path}: pattern S3M {pattern_index} fora do arquivo")
        packed_length = struct.unpack_from("<H", data, pattern_offset)[0]
        packed = data[pattern_offset + 2:pattern_offset + 2 + packed_length]
        if len(packed) < packed_length:
            raise SystemExit(f"{path}: pattern S3M {pattern_index} incompleto")

        row = 0
        cursor = 0
        tracker_speed = base_row_duration
        row_duration = tracker_speed
        channel_last_frequencies = [0] * 32
        note_rows = []
        pattern_end_row = 64
        while row < 64 and cursor < len(packed):
            token = packed[cursor]
            cursor += 1
            if token == 0:
                row += 1
                continue

            channel = token & 0x1F
            note = 255
            instrument = 0
            volume_column = None
            command = 0
            info = 0
            if token & 0x20:
                if cursor + 2 > len(packed):
                    raise SystemExit(f"{path}: note/instrument S3M truncado")
                note = packed[cursor]
                instrument = packed[cursor + 1]
                cursor += 2
            if token & 0x40:
                if cursor >= len(packed):
                    raise SystemExit(f"{path}: volume S3M truncado")
                volume_column = packed[cursor]
                cursor += 1
            if token & 0x80:
                if cursor + 2 > len(packed):
                    raise SystemExit(f"{path}: comando S3M truncado")
                command = packed[cursor]
                info = packed[cursor + 1]
                cursor += 2

            if command == 1 and info > 0:
                tracker_speed = max(1, min(255, info))
                row_duration = tracker_speed
            elif command == 2:
                if pattern_index not in pattern_controls:
                    pattern_controls[pattern_index] = {
                        "end_row": row,
                        "jump_order": info,
                    }
                    pattern_end_row = min(pattern_end_row, row)
            elif command == 3:
                if pattern_index not in pattern_controls:
                    pattern_controls[pattern_index] = {
                        "end_row": row,
                    }
                    pattern_end_row = min(pattern_end_row, row)
            elif command == 20 and info > 0:
                row_duration = tracker_row_duration_from_tempo(tracker_speed, info)

            frequency = s3m_note_to_frequency(note)
            if frequency == 0:
                continue

            note_volume = fallback_volume
            if volume_column is not None and volume_column <= 64:
                note_volume = max(0, min(15, volume_column // 4))
            elif instrument > 0 and instrument <= len(instrument_volumes):
                note_volume = instrument_volumes[instrument - 1]

            note_rows.append({
                "row": row,
                "channel": 1 + (channel % 4),
                "frequency_hz": frequency,
                "previous_frequency_hz": channel_last_frequencies[channel] if channel < len(channel_last_frequencies) else 0,
                "volume": note_volume,
                "row_duration": row_duration,
                "command": command,
                "parameter": info,
                "sample_index": sample_asset_indexes.get(instrument, -1),
                "sample_rate_hz": max(1, min(32768, int(round(
                    (instrument_sample_rates[instrument - 1] if 0 < instrument <= len(instrument_sample_rates) else 8363)
                    * math.pow(2.0, ((12 + (note >> 4) * 12 + (note & 0x0F)) - 60) / 12.0)
                )))),
            })
            if channel < len(channel_last_frequencies):
                channel_last_frequencies[channel] = frequency

        note_rows = [note for note in note_rows if note["row"] < pattern_end_row]
        steps = []
        if not note_rows:
            steps.append({
                "channel": 2,
                "frequency_hz": 64,
                "duration_frames": min(255, 64 * base_row_duration),
                "volume": 0,
                "duty": step_duty,
            })
        else:
            row_numbers = sorted(set(note["row"] for note in note_rows))
            for row_index, row_number in enumerate(row_numbers):
                row_notes = [note for note in note_rows if note["row"] == row_number]
                next_row = row_numbers[row_index + 1] if row_index + 1 < len(row_numbers) else pattern_end_row
                duration = max(1, min(255, (next_row - row_number) * row_notes[0]["row_duration"]))
                if len(row_notes) == 1:
                    start_index = len(steps)
                    append_s3m_effect_steps(steps, row_notes[0], duration, step_duty)
                    steps[start_index]["sample_index"] = row_notes[0]["sample_index"]
                    steps[start_index]["sample_rate_hz"] = row_notes[0]["sample_rate_hz"]
                    continue
                for note_index, note in enumerate(row_notes):
                    note_steps = []
                    append_s3m_effect_steps(note_steps, note, duration, step_duty)
                    simultaneous = note_steps[0]
                    simultaneous["duration_frames"] = duration if note_index == len(row_notes) - 1 else 0
                    simultaneous["sample_index"] = note["sample_index"]
                    simultaneous["sample_rate_hz"] = note["sample_rate_hz"]
                    steps.append(simultaneous)
        patterns.append({ "steps": steps })

    return {
        "patterns": patterns,
        "order": resolve_tracker_order(order, pattern_controls),
        "samples": tracker_samples,
    }


def parse_vgm_tracker(path, duty=2):
    data = Path(path).read_bytes()
    if len(data) < 0x40:
        raise SystemExit(f"{path}: VGM muito pequeno")
    if data[0:4] != b"Vgm ":
        raise SystemExit(f"{path}: assinatura VGM ausente")

    version = struct.unpack_from("<I", data, 0x08)[0]
    sn76489_clock = struct.unpack_from("<I", data, 0x0C)[0]
    if sn76489_clock == 0:
        raise SystemExit(f"{path}: VGM sem clock SN76489")

    if version >= 0x150:
        data_offset = 0x34 + struct.unpack_from("<I", data, 0x34)[0]
    else:
        data_offset = 0x40
    if data_offset <= 0 or data_offset >= len(data):
        raise SystemExit(f"{path}: offset de dados VGM invalido")

    step_duty = require_int(duty, "duty", 0, 3)
    tone_registers = [0, 0, 0]
    volumes = [12, 12, 12, 12]
    noise_control = 0
    latched_channel = 0
    latched_type = 0
    current_frame = 0
    notes = []
    cursor = data_offset

    while cursor < len(data):
        command = data[cursor]
        cursor += 1
        if command == 0x66:
            break
        if command == 0x4F:
            if cursor >= len(data):
                raise SystemExit(f"{path}: stereo GG VGM truncado")
            cursor += 1
            continue
        if command == 0x50:
            if cursor >= len(data):
                raise SystemExit(f"{path}: comando PSG VGM truncado")
            value = data[cursor]
            cursor += 1
            if value & 0x80:
                latched_channel = (value >> 5) & 0x03
                latched_type = (value >> 4) & 0x01
                payload = value & 0x0F
                if latched_type == 0 and latched_channel < 3:
                    tone_registers[latched_channel] = (tone_registers[latched_channel] & 0x3F0) | payload
                elif latched_type == 0 and latched_channel == 3:
                    noise_control = payload & 0x07
                    append_vgm_note(
                        notes,
                        current_frame,
                        4,
                        sn76489_noise_frequency(noise_control, tone_registers[2], sn76489_clock),
                        volumes[3],
                    )
                else:
                    volumes[latched_channel] = max(0, min(15, 15 - payload))
                    if latched_channel < 3 and tone_registers[latched_channel] > 0:
                        period = tone_registers[latched_channel]
                        append_vgm_note(
                            notes,
                            current_frame,
                            latched_channel + 1,
                            clamp_tracker_frequency(int(round(sn76489_clock / (32 * period)))),
                            volumes[latched_channel],
                        )
                    elif latched_channel == 3:
                        append_vgm_note(
                            notes,
                            current_frame,
                            4,
                            sn76489_noise_frequency(noise_control, tone_registers[2], sn76489_clock),
                            volumes[3],
                        )
            else:
                payload = value & 0x3F
                if latched_type == 0 and latched_channel < 3:
                    tone_registers[latched_channel] = (tone_registers[latched_channel] & 0x00F) | (payload << 4)
                    period = tone_registers[latched_channel]
                    if period > 0:
                        frequency = clamp_tracker_frequency(int(round(sn76489_clock / (32 * period))))
                        append_vgm_note(
                            notes,
                            current_frame,
                            latched_channel + 1,
                            frequency,
                            volumes[latched_channel],
                        )
            continue

        if command == 0x61:
            if cursor + 2 > len(data):
                raise SystemExit(f"{path}: wait VGM truncado")
            sample_count = struct.unpack_from("<H", data, cursor)[0]
            cursor += 2
            current_frame += frames_from_vgm_samples(sample_count)
            continue
        if command == 0x62:
            current_frame += 1
            continue
        if command == 0x63:
            current_frame += frames_from_vgm_samples(882)
            continue
        if 0x70 <= command <= 0x7F:
            current_frame += frames_from_vgm_samples(command - 0x6F)
            continue
        if command == 0x67:
            if cursor + 6 > len(data):
                raise SystemExit(f"{path}: data block VGM truncado")
            if data[cursor] != 0x66:
                raise SystemExit(f"{path}: data block VGM invalido")
            cursor += 1
            cursor += 1
            block_size = struct.unpack_from("<I", data, cursor)[0]
            cursor += 4
            if cursor + block_size > len(data):
                raise SystemExit(f"{path}: data block VGM incompleto")
            cursor += block_size
            continue

        raise SystemExit(f"{path}: comando VGM 0x{command:02X} nao suportado nesta versao")

    if not notes:
        patterns = [{
            "steps": [{
                "channel": 2,
                "frequency_hz": 64,
                "duration_frames": 1,
                "volume": 0,
                "duty": step_duty,
            }]
        }]
    else:
        steps = []
        for note_index, note in enumerate(notes):
            next_frame = notes[note_index + 1]["frame"] if note_index + 1 < len(notes) else max(current_frame, note["frame"] + 1)
            duration = max(1, min(255, next_frame - note["frame"]))
            steps.append({
                "channel": note["channel"],
                "frequency_hz": note["frequency_hz"],
                "duration_frames": duration,
                "volume": note["volume"],
                "duty": step_duty,
            })
        patterns = [{ "steps": steps }]

    return {
        "patterns": patterns,
        "order": [0],
    }


def emit_audio_header(name, data, base_dir):
    sfx_assets = data.get("sfx", [])
    music_assets = data.get("music", [])
    tracker_assets = data.get("tracker", [])
    pcm_assets = data.get("pcm", [])
    if not isinstance(sfx_assets, list) or not isinstance(music_assets, list) or not isinstance(tracker_assets, list) or not isinstance(pcm_assets, list):
        raise SystemExit("audio JSON precisa conter listas 'sfx', 'music', 'tracker' e/ou 'pcm'")

    lines = [
        "#pragma once",
        "#include <stdint.h>",
        "#include \"gbs/audio.hpp\"",
        "",
    ]

    # C++17 inline constants have one identity across mixed-runtime translation units.
    # Build-local caches: metadata belongs to each descriptor; bytes can be shared.
    wav_conversions = {}
    pcm_data_symbols = {}
    sfx_asset_names = []
    for asset_index, asset in enumerate(sfx_assets):
        tones = asset.get("tones", [])
        if not isinstance(tones, list) or not tones:
            raise SystemExit("cada SFX precisa conter ao menos um tone")
        asset_name = asset.get("name", f"sfx_{asset_index}")
        symbol = f"{name}_{asset_name}"
        sfx_asset_names.append(symbol)
        lines.append(f"inline constexpr gbs::SfxTone {symbol}_tones[{len(tones)}] = {{")
        for tone in tones:
            frequency = require_int(tone.get("frequency_hz"), "frequency_hz", 16, 32767)
            duration = require_int(tone.get("duration_frames"), "duration_frames", 1, 255)
            volume = require_int(tone.get("volume"), "volume", 0, 15)
            duty = require_int(tone.get("duty", 2), "duty", 0, 3)
            noise = "true" if bool(tone.get("noise", False)) else "false"
            attack = require_int(tone.get("attack_frames", 0), "attack_frames", 0, 255)
            release = require_int(tone.get("release_frames", 0), "release_frames", 0, 255)
            waveform = require_int(tone.get("waveform", 0), "waveform", 0, 3)
            pan = require_int(tone.get("pan", 0), "pan", -127, 127)
            lines.append(f"    {{ {frequency}, {duration}, {volume}, {duty}, {noise}, {attack}, {release}, {waveform}, {pan} }},")
        lines.extend([
            "};",
            f"inline constexpr gbs::SfxAsset {symbol}_asset = {{ {symbol}_tones, {len(tones)} }};",
            "",
        ])

    music_asset_names = []
    for asset_index, asset in enumerate(music_assets):
        steps = asset.get("steps", [])
        if not isinstance(steps, list) or not steps:
            raise SystemExit("cada musica precisa conter ao menos um step")
        asset_name = asset.get("name", f"music_{asset_index}")
        symbol = f"{name}_{asset_name}"
        music_asset_names.append(symbol)
        lines.append(f"inline constexpr gbs::MusicStep {symbol}_steps[{len(steps)}] = {{")
        for step in steps:
            frequency = require_int(step.get("frequency_hz"), "frequency_hz", 16, 32767)
            duration = require_int(step.get("duration_frames"), "duration_frames", 1, 255)
            volume = require_int(step.get("volume"), "volume", 0, 15)
            duty = require_int(step.get("duty", 2), "duty", 0, 3)
            pan = require_int(step.get("pan", 0), "pan", -127, 127)
            lines.append(f"    {{ {frequency}, {duration}, {volume}, {duty}, {pan} }},")
        loop = "true" if bool(asset.get("loop", False)) else "false"
        lines.extend([
            "};",
            f"inline constexpr gbs::MusicAsset {symbol}_asset = {{ {symbol}_steps, {len(steps)}, {loop} }};",
            "",
        ])

    tracker_asset_names = []
    for asset_index, asset in enumerate(tracker_assets):
        tracker_samples = []
        if "mod" in asset:
            mod_path = base_dir / asset["mod"]
            converted = parse_mod_tracker(
                mod_path,
                asset.get("row_duration_frames", 4),
                asset.get("volume", 8),
                asset.get("duty", 2),
            )
            patterns = converted["patterns"]
            order = converted["order"]
            tracker_samples = converted.get("samples", [])
        elif "s3m" in asset:
            s3m_path = base_dir / asset["s3m"]
            converted = parse_s3m_tracker(
                s3m_path,
                asset.get("row_duration_frames", 4),
                asset.get("volume", 8),
                asset.get("duty", 2),
            )
            patterns = converted["patterns"]
            order = converted["order"]
            tracker_samples = converted.get("samples", [])
        elif "vgm" in asset:
            vgm_path = base_dir / asset["vgm"]
            converted = parse_vgm_tracker(
                vgm_path,
                asset.get("duty", 2),
            )
            patterns = converted["patterns"]
            order = converted["order"]
        else:
            patterns = asset.get("patterns", [])
            order = asset.get("order", [])
            for sample in asset.get("samples", []):
                source_path = (base_dir / sample["wav"]).resolve()
                if source_path not in wav_conversions:
                    wav_conversions[source_path] = convert_wav_to_pcm8(source_path)
                samples, rate, auto_start, auto_end = wav_conversions[source_path]
                if not samples or len(samples) > 65535:
                    raise SystemExit("instrumento WAV precisa conter de 1 a 65535 amostras PCM convertidas")
                loop = bool(sample.get("loop", False))
                tracker_samples.append({"samples": samples, "sample_rate_hz": rate,
                    "loop_start_sample": auto_start if loop and auto_end > auto_start else 0,
                    "loop_end_sample": (auto_end if auto_end > auto_start else len(samples)) if loop else 0})
        if not isinstance(patterns, list) or not patterns:
            raise SystemExit("cada tracker precisa conter ao menos um pattern")
        if not isinstance(order, list) or not order:
            raise SystemExit("cada tracker precisa conter order com ao menos um pattern")
        asset_name = asset.get("name", f"tracker_{asset_index}")
        symbol = f"{name}_{asset_name}"
        tracker_asset_names.append(symbol)
        if tracker_samples:
            sample_data_symbols = []
            for sample_index, sample_asset in enumerate(tracker_samples):
                sample_data = sample_asset["samples"]
                data_key = tuple(sample_data)
                data_symbol = pcm_data_symbols.get(data_key)
                if data_symbol is None:
                    data_symbol = f"{symbol}_sample_{sample_index}_data"
                    pcm_data_symbols[data_key] = data_symbol
                    lines.append(f"inline constexpr int8_t {data_symbol}[{len(sample_data)}] = {{")
                    for offset in range(0, len(sample_data), 16):
                        lines.append("    " + ", ".join(str(value) for value in sample_data[offset:offset + 16]) + ",")
                    lines.append("};")
                sample_data_symbols.append(data_symbol)
            lines.append(f"inline constexpr gbs::PcmAsset {symbol}_sample_assets[{len(tracker_samples)}] = {{")
            for sample_index, sample_asset in enumerate(tracker_samples):
                sample_data = sample_asset["samples"]
                loop_start = sample_asset.get("loop_start_sample", 0)
                loop_end = sample_asset.get("loop_end_sample", 0)
                loop_literal = "true" if loop_end > loop_start else "false"
                lines.append(
                    f"    {{ {sample_data_symbols[sample_index]}, {len(sample_data)}, {sample_asset['sample_rate_hz']}, "
                    f"{loop_literal}, {loop_start}, {loop_end} }},"
                )
            lines.extend(["};", ""])
        pattern_symbols = []
        for pattern_index, pattern in enumerate(patterns):
            steps = pattern.get("steps", [])
            if not isinstance(steps, list) or not steps:
                raise SystemExit("cada pattern tracker precisa conter ao menos um step")
            pattern_symbol = f"{symbol}_pattern_{pattern_index}"
            pattern_symbols.append(pattern_symbol)
            lines.append(f"inline constexpr gbs::TrackerStep {pattern_symbol}_steps[{len(steps)}] = {{")
            for step in steps:
                channel = require_int(step.get("channel", 2), "channel", 1, 4)
                frequency = require_int(step.get("frequency_hz"), "frequency_hz", 16, 32767)
                duration = require_int(step.get("duration_frames"), "duration_frames", 0, 255)
                volume = require_int(step.get("volume"), "volume", 0, 15)
                duty = require_int(step.get("duty", 2), "duty", 0, 3)
                attack = require_int(step.get("attack_frames", 0), "attack_frames", 0, 255)
                release = require_int(step.get("release_frames", 0), "release_frames", 0, 255)
                waveform = require_int(step.get("waveform", 0), "waveform", 0, 3)
                sample_index = require_int(step.get("sample_index", -1), "sample_index", -1, len(tracker_samples) - 1 if tracker_samples else -1)
                sample_rate = require_int(step.get("sample_rate_hz", 0), "sample_rate_hz", 0, 32768)
                sample_only = bool(step.get("sample_only", False))
                if sample_only:
                    if sample_index < 0:
                        raise SystemExit("instrumento PCM requer sample_index válido")
                    ratio = step.get("sample_pitch_ratio", 1)
                    if not isinstance(ratio, (int, float)) or not math.isfinite(ratio) or not 1 / 64 <= ratio <= 64:
                        raise SystemExit("sample_pitch_ratio precisa estar entre 1/64 e 64")
                    sample_rate = max(1, round(tracker_samples[sample_index]["sample_rate_hz"] * ratio))
                pan = require_int(step.get("pan", 0), "pan", -127, 127)
                suffix = ", 0, 0, false, true" if sample_only else ""
                lines.append(
                    f"    {{ {channel}, {frequency}, {duration}, {volume}, {duty}, {attack}, {release}, "
                    f"{waveform}, {sample_index}, {sample_rate}, {pan}{suffix} }},"
                )
            lines.extend([
                "};",
                f"inline constexpr gbs::TrackerPattern {pattern_symbol} = {{ {pattern_symbol}_steps, {len(steps)} }};",
                "",
            ])
        lines.append(f"inline constexpr gbs::TrackerPattern {symbol}_patterns[{len(pattern_symbols)}] = {{")
        for pattern_symbol in pattern_symbols:
            lines.append(f"    {pattern_symbol},")
        lines.extend([
            "};",
            f"inline constexpr uint8_t {symbol}_order[{len(order)}] = {{",
        ])
        for order_entry in order:
            pattern_index = require_int(order_entry, "order", 0, len(pattern_symbols) - 1)
            lines.append(f"    {pattern_index},")
        loop = "true" if bool(asset.get("loop", False)) else "false"
        lines.extend([
            "};",
            f"inline constexpr gbs::TrackerAsset {symbol}_asset = {{ {symbol}_patterns, {len(pattern_symbols)}, {symbol}_order, {len(order)}, {loop}, "
            f"{symbol}_sample_assets, {len(tracker_samples)} }};" if tracker_samples else
            f"inline constexpr gbs::TrackerAsset {symbol}_asset = {{ {symbol}_patterns, {len(pattern_symbols)}, {symbol}_order, {len(order)}, {loop} }};",
            "",
        ])

    pcm_asset_names = []
    for asset_index, asset in enumerate(pcm_assets):
        asset_name = asset.get("name", f"pcm_{asset_index}")
        symbol = f"{name}_{asset_name}"
        pcm_asset_names.append(symbol)
        target_sample_rate = asset.get("sample_rate_hz")
        if target_sample_rate is not None:
            target_sample_rate = require_int(target_sample_rate, "sample_rate_hz", 4000, 32768)
        if "wav" in asset:
            wav_path = base_dir / asset["wav"]
            samples, sample_rate, auto_loop_start, auto_loop_end = convert_wav_to_pcm8(wav_path, target_sample_rate)
        elif "mod_sample" in asset:
            mod_path = base_dir / asset["mod_sample"]
            sample_index = asset.get("sample_index", 1)
            samples, sample_rate, auto_loop_start, auto_loop_end = convert_mod_sample_to_pcm8(mod_path, sample_index, target_sample_rate)
        elif "s3m_sample" in asset:
            s3m_path = base_dir / asset["s3m_sample"]
            instrument_index = asset.get("instrument_index", asset.get("sample_index", 1))
            samples, sample_rate, auto_loop_start, auto_loop_end = convert_s3m_sample_to_pcm8(s3m_path, instrument_index, target_sample_rate)
        else:
            samples = asset.get("samples", [])
            if not isinstance(samples, list) or not samples:
                raise SystemExit("cada PCM precisa conter ao menos um sample, wav, mod_sample ou s3m_sample")
            sample_rate = require_int(target_sample_rate, "sample_rate_hz", 4000, 32768)
            auto_loop_start = 0
            auto_loop_end = 0
        loop, loop_start, loop_end = resolve_pcm_loop(asset, samples, auto_loop_start, auto_loop_end)
        loop_literal = "true" if loop else "false"
        lines.append(f"inline constexpr int8_t {symbol}_samples[{len(samples)}] = {{")
        row = []
        for sample in samples:
            value = require_int(sample, "sample", -128, 127)
            row.append(str(value))
            if len(row) == 16:
                lines.append("    " + ", ".join(row) + ",")
                row = []
        if row:
            lines.append("    " + ", ".join(row) + ",")
        lines.extend([
            "};",
            f"inline constexpr gbs::PcmAsset {symbol}_asset = {{ {symbol}_samples, {len(samples)}, {sample_rate}, {loop_literal}, {loop_start}, {loop_end} }};",
            "",
        ])

    lines.append(f"inline constexpr gbs::SfxAsset {name}_sfx_assets[{max(1, len(sfx_asset_names))}] = {{")
    for symbol in sfx_asset_names:
        lines.append(f"    {symbol}_asset,")
    if not sfx_asset_names:
        lines.append("    { nullptr, 0 },")
    lines.extend([
        "};",
        f"inline constexpr int {name}_sfx_asset_count = {len(sfx_asset_names)};",
        "",
        f"inline constexpr gbs::MusicAsset {name}_music_assets[{max(1, len(music_asset_names))}] = {{",
    ])
    for symbol in music_asset_names:
        lines.append(f"    {symbol}_asset,")
    if not music_asset_names:
        lines.append("    { nullptr, 0, false },")
    lines.extend([
        "};",
        f"inline constexpr int {name}_music_asset_count = {len(music_asset_names)};",
        "",
        f"inline constexpr gbs::TrackerAsset {name}_tracker_assets[{max(1, len(tracker_asset_names))}] = {{",
    ])
    for symbol in tracker_asset_names:
        lines.append(f"    {symbol}_asset,")
    if not tracker_asset_names:
        lines.append("    { nullptr, 0, nullptr, 0, false },")
    lines.extend([
        "};",
        f"inline constexpr int {name}_tracker_asset_count = {len(tracker_asset_names)};",
        "",
        f"inline constexpr gbs::PcmAsset {name}_pcm_assets[{max(1, len(pcm_asset_names))}] = {{",
    ])
    for symbol in pcm_asset_names:
        lines.append(f"    {symbol}_asset,")
    if not pcm_asset_names:
        lines.append("    { nullptr, 0, 0, false },")
    lines.extend([
        "};",
        f"inline constexpr int {name}_pcm_asset_count = {len(pcm_asset_names)};",
        "",
    ])

    return "\n".join(lines)


PACK_RESOURCE_LIMITS = {
    # Tiles 896..1023 ficam reservados pelo runtime para a UI (menu, dialogo e HUD).
    "bg_tiles": 896,
    "obj_tiles": 1024,
    "affine_bg_tiles": 256,
    "bg_palette_colors": 256,
    "obj_palette_colors": 256,
    "oam_sprites": 128,
    "pcm_bytes": 65535,
}


PACK_BUDGET_WARNING_PERCENT = 80
PACK_SPLIT_RECOMMENDATION_PERCENT = 50

PACK_PRODUCTION_PROFILE_LIMITS = {
    "global": {
        "bg_tiles": (60, 80),
        "obj_tiles": (55, 75),
        "affine_bg_tiles": (50, 70),
        "bg_palette_colors": (60, 80),
        "obj_palette_colors": (60, 80),
        "oam_sprites": (55, 75),
        "pcm_bytes": (55, 75),
    },
    "topdown": {
        "bg_tiles": (65, 82),
        "obj_tiles": (55, 75),
        "bg_palette_colors": (62, 82),
        "obj_palette_colors": (55, 75),
        "oam_sprites": (50, 70),
        "pcm_bytes": (45, 70),
    },
    "platformer": {
        "bg_tiles": (55, 76),
        "obj_tiles": (62, 82),
        "bg_palette_colors": (55, 75),
        "obj_palette_colors": (62, 82),
        "oam_sprites": (60, 80),
        "pcm_bytes": (45, 70),
    },
    "isometric": {
        "bg_tiles": (68, 84),
        "obj_tiles": (50, 72),
        "bg_palette_colors": (65, 82),
        "obj_palette_colors": (52, 72),
        "oam_sprites": (48, 68),
        "pcm_bytes": (45, 70),
    },
    "point_click": {
        "bg_tiles": (70, 86),
        "obj_tiles": (38, 58),
        "bg_palette_colors": (68, 84),
        "obj_palette_colors": (38, 58),
        "oam_sprites": (30, 50),
        "pcm_bytes": (45, 70),
    },
    "shmup": {
        "bg_tiles": (48, 68),
        "obj_tiles": (68, 86),
        "bg_palette_colors": (45, 65),
        "obj_palette_colors": (68, 86),
        "oam_sprites": (70, 88),
        "pcm_bytes": (50, 72),
    },
    "visual_novel": {
        "bg_tiles": (72, 88),
        "obj_tiles": (35, 55),
        "bg_palette_colors": (70, 86),
        "obj_palette_colors": (35, 55),
        "oam_sprites": (25, 45),
        "pcm_bytes": (55, 78),
    },
    "menu": {
        "bg_tiles": (55, 75),
        "obj_tiles": (45, 65),
        "bg_palette_colors": (55, 75),
        "obj_palette_colors": (45, 65),
        "oam_sprites": (35, 55),
        "pcm_bytes": (30, 55),
    },
    "cutscene": {
        "bg_tiles": (70, 86),
        "obj_tiles": (45, 65),
        "bg_palette_colors": (68, 84),
        "obj_palette_colors": (45, 65),
        "oam_sprites": (35, 55),
        "pcm_bytes": (62, 82),
    },
    "world_map": {
        "bg_tiles": (62, 82),
        "obj_tiles": (48, 68),
        "bg_palette_colors": (60, 80),
        "obj_palette_colors": (48, 68),
        "oam_sprites": (45, 65),
        "pcm_bytes": (35, 58),
    },
}

PACK_RESOURCE_BANK_KINDS = {
    "bg_tiles": "bg_tiles",
    "obj_tiles": "obj_tiles",
    "bg_palette_colors": "bg_palette",
    "obj_palette_colors": "obj_palette",
    "oam_sprites": "oam_sprites",
}

PACK_RESOURCE_BANK_ALIGNMENT = {
    "bg_tiles": 1,
    "obj_tiles": 1,
    "bg_palette_colors": 16,
    "obj_palette_colors": 16,
    "oam_sprites": 4,
}


def pack_align(value, alignment):
    if alignment <= 1:
        return value
    return ((value + alignment - 1) // alignment) * alignment


def pack_reserve(pool, start, count):
    if count <= 0 or start < 0 or start + count > len(pool):
        return False
    for index in range(start, start + count):
        if pool[index]:
            return False
    for index in range(start, start + count):
        pool[index] = True
    return True


def pack_reserve_next(pool, count, alignment):
    start = 0
    while start + count <= len(pool):
        start = pack_align(start, alignment)
        if start + count > len(pool):
            break
        if pack_reserve(pool, start, count):
            return start
        start += 1
    return None


def pack_reserve_same(pools, start, count):
    if not pools or count <= 0:
        return False
    if any(start < 0 or start + count > len(pool) for pool in pools):
        return False
    if any(any(pool[index] for index in range(start, start + count)) for pool in pools):
        return False
    for pool in pools:
        for index in range(start, start + count):
            pool[index] = True
    return True


def pack_reserve_next_same(pools, count, alignment):
    if not pools:
        return None
    start = 0
    while start + count <= len(pools[0]):
        start = pack_align(start, alignment)
        if start + count > len(pools[0]):
            break
        if pack_reserve_same(pools, start, count):
            return start
        start += 1
    return None


PACK_ASSET_KINDS = frozenset((
    "audio", "palette", "obj", "bg", "affine_bg", "indexed_bg", "paged_bg",
    "bitmap3", "bitmap4", "bitmap5",
))


def pack_asset_kind(asset):
    kind = asset.get("kind", "bg")
    if kind not in PACK_ASSET_KINDS:
        raise SystemExit(f"{asset.get('name', 'asset')}: kind de asset nao suportado: {kind}")
    return kind


def pack_png_resources(asset, base_dir):
    kind = pack_asset_kind(asset)
    png_name = asset.get("png")
    if not png_name:
        return {}
    path = base_dir / png_name

    if kind == "bitmap3":
        width, height, colors, _ = read_png(path, max_colors=240 * 160)
        if width > 240 or height > 160:
            raise SystemExit(f"{png_name}: bitmap3 excede 240x160")
        return { "bitmap_pixels": width * height * 2, "palette_colors": len(colors) }
    if kind == "bitmap4":
        width, height, colors, _ = read_png(path, max_colors=256)
        if width > 240 or height > 160:
            raise SystemExit(f"{png_name}: bitmap4 excede 240x160")
        return { "bitmap_pixels": width * height, "bg_palette_colors": len(colors) }
    if kind == "bitmap5":
        width, height, colors, _ = read_png(path, max_colors=240 * 160)
        if width > 160 or height > 128:
            raise SystemExit(f"{png_name}: bitmap5 excede 160x128")
        return { "bitmap_pixels": width * height * 2, "palette_colors": len(colors) }
    if kind == "affine_bg":
        width, height, colors, indices = read_png(path, max_colors=256)
        tiles, tilemap_entries, tilemap_width, tilemap_height = build_affine_tiles(
            width,
            height,
            indices,
            optimize_tile_budget=pack_affine_tile_budget(asset),
        )
        return {
            "affine_bg_tiles": len(tiles),
            "bg_palette_colors": len(colors),
            "tilemap_entries": len(tilemap_entries),
            "tilemap_width": tilemap_width,
            "tilemap_height": tilemap_height,
        }
    if kind in ("indexed_bg", "paged_bg"):
        width, height, colors, indices = read_png(path, max_colors=224 if kind == "paged_bg" else 256)
        tiles, tilemap_entries, tilemap_width, tilemap_height = build_indexed_background_tiles(
            width, height, indices, max_source_tiles=65535 if kind == "paged_bg" else 1024
        )
        if kind == "paged_bg":
            if len(colors) > 224:
                raise SystemExit("paged_bg reserva bancos 14 e 15 para HUD/dialogo: maximo 224 cores")
            return {
                "paged_viewport_bytes": 0 if asset.get("paged_palette_owner") else 651 * 64,
                "rom_source_bytes": len(tiles) * 64,
                "resident_foreground_bytes": len(tiles) * 64 if asset.get("paged_palette_owner") else 0,
                "bg_palette_colors": 0 if asset.get("paged_palette_owner") else 224,
                "tilemap_entries": 1024,
                "tilemap_width": tilemap_width,
                "tilemap_height": tilemap_height,
            }
        return {
            "isometric_source_bytes": len(tiles) * 64,
            "bg_palette_colors": 256,
            "tilemap_entries": len(tilemap_entries),
            "tilemap_width": tilemap_width,
            "tilemap_height": tilemap_height,
        }
    if kind == "obj":
        sprite_bpp = require_int(asset.get("sprite_bpp", 4), "sprite_bpp", 4, 8)
        width, height, colors, indices, transparent_index = read_png(
            path,
            max_colors=None if sprite_bpp == 8 else 16,
            include_transparency=True,
        )
        colors, indices = prepare_obj_asset_pixels(
            colors,
            indices,
            transparent_index,
            asset,
        )
        sprite_width = int(asset.get("sprite_width", 16))
        sprite_height = int(asset.get("sprite_height", 16))
        sprite_plan = build_sprite_tile_plan(width, height, indices, sprite_width, sprite_height, sprite_bpp)
        tile_count = max(sprite_plan["frame_tile_counts"]) if asset.get("stream_frames") else len(sprite_plan["tiles"])
        parts_per_frame = len(decompose_sprite_frame(sprite_width, sprite_height))
        return {
            "obj_tiles": tile_count * (2 if sprite_bpp == 8 else 1),
            "obj_palette_colors": len(asset["object_palette_plan"]["values"]) if "object_palette_plan" in asset else (256 if sprite_bpp == 8 else 16) if colors else 0,
            "oam_sprites": int(asset.get("oam_sprites", parts_per_frame)),
            "sprite_frames": sprite_plan["frame_count"],
        }

    width, height, colors, indices, transparent_index = read_png(
        path, max_colors=256, include_transparency=True
    )
    tile_budget = pack_background_tile_budget(asset)
    background = build_cached_4bpp_background(
        width,
        height,
        colors,
        indices,
        transparent_index,
        optimize_tile_budget=tile_budget,
        return_optimization=tile_budget is not None,
        max_palette_banks=pack_background_palette_banks(asset),
        reference_plan=background_palette_reference_plan(asset, base_dir),
    )
    palette, tiles, tilemap_entries, tilemap_width, tilemap_height = background[:5]
    return {
        "bg_tiles": len(tiles),
        "bg_palette_colors": len(palette),
        "tilemap_entries": len(tilemap_entries),
        "tilemap_width": tilemap_width,
        "tilemap_height": tilemap_height,
    }


def pack_background_tile_budget(asset):
    if not asset.get("optimize_background_tiles"):
        return None
    return require_int(asset.get("background_tile_budget", 1024), "background_tile_budget", 1, 1024)


def pack_background_palette_banks(asset):
    return require_int(asset.get("background_palette_banks", 16), "background_palette_banks", 1, 16)


def background_palette_plan_from_mapping(reference, source, max_palette_banks=16):
    if not isinstance(reference, dict):
        raise SystemExit(f"{source}: plano de paleta precisa ser objeto")

    raw_banks = reference.get("banks")
    raw_assignments = reference.get("tile_palette_banks")
    if not isinstance(raw_banks, list) or not raw_banks or len(raw_banks) > max_palette_banks:
        raise SystemExit(f"{source}: plano de paleta precisa conter entre 1 e {max_palette_banks} bancos")
    if not isinstance(raw_assignments, list):
        raise SystemExit(f"{source}: plano de paleta precisa conter tile_palette_banks[]")

    banks = []
    for bank_index, raw_bank in enumerate(raw_banks):
        if not isinstance(raw_bank, list) or len(raw_bank) > 16:
            raise SystemExit(f"{source}: banco {bank_index} precisa conter no maximo 16 cores")
        bank = []
        for color in raw_bank:
            if color is None:
                bank.append(None)
                continue
            if (
                not isinstance(color, list)
                or len(color) != 3
                or any(not isinstance(channel, int) or not 0 <= channel <= 255 for channel in color)
            ):
                raise SystemExit(f"{source}: banco {bank_index} possui uma cor RGB invalida")
            bank.append(tuple(color))
        banks.append(bank)

    assignments = []
    for tile_index, assignment in enumerate(raw_assignments):
        if not isinstance(assignment, int) or not 0 <= assignment < len(banks):
            raise SystemExit(f"{source}: tile_palette_banks[{tile_index}] aponta para banco inexistente")
        assignments.append(assignment)
    return {
        "banks": banks,
        "tile_palette_banks": assignments,
        "strategy": "shared-reference",
    }


def background_palette_plan_from_path(path, max_palette_banks=16):
    path = Path(path)
    if path.suffix.lower() == ".json":
        try:
            reference = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise SystemExit(f"{path}: plano de paleta JSON invalido: {error}") from error
        return background_palette_plan_from_mapping(reference, path, max_palette_banks)

    width, height, colors, indices, transparent_index = read_png(
        path, max_colors=256, include_transparency=True
    )
    return prepare_4bpp_background(
        width,
        height,
        colors,
        indices,
        max_palette_banks=max_palette_banks,
        transparent_index=transparent_index,
    )


def background_palette_reference_plan(asset, base_dir):
    inline_plan = asset.get("background_palette_reference_plan")
    if inline_plan is not None:
        return background_palette_plan_from_mapping(
            inline_plan,
            f"{asset.get('name', 'asset')}.background_palette_reference_plan",
            pack_background_palette_banks(asset),
        )
    inline_colors = asset.get("background_palette_reference_colors")
    if inline_colors is not None:
        if not isinstance(inline_colors, list) or not inline_colors or len(inline_colors) > 16:
            raise SystemExit("background_palette_reference_colors precisa ter entre 1 e 16 cores")
        return {"colors": [
            tuple(
                require_int(channel, "background_palette_reference_colors[]", 0, 255)
                for channel in color
            )
            for color in inline_colors
            if isinstance(color, (list, tuple)) and len(color) == 3
        ]}
    reference = asset.get("background_palette_reference")
    if not reference:
        return None
    if not isinstance(reference, str):
        raise SystemExit("background_palette_reference precisa ser string")
    return background_palette_plan_from_path(
        resolve_project_path(base_dir, reference, "asset.background_palette_reference"),
        pack_background_palette_banks(asset),
    )


def pack_affine_tile_budget(asset):
    if not asset.get("optimize_affine_tiles"):
        return None
    return require_int(asset.get("affine_tile_budget", 256), "affine_tile_budget", 1, 256)


def pack_global_obj_palette_key(asset, base_dir):
    if base_dir is None or asset.get("kind") != "obj" or not asset.get("png"):
        return None
    bpp = int(asset.get("sprite_bpp", 4))
    _width, _height, colors, indices, transparent = read_png(base_dir / asset["png"], max_colors=None if bpp == 8 else 16, include_transparency=True)
    colors, _indices = prepare_obj_asset_pixels(colors, indices, transparent, asset)
    count = len(asset["object_palette_plan"]["values"]) if "object_palette_plan" in asset else 256 if bpp == 8 else 16
    values = [rgb15(color) for color in colors]
    return tuple(values + [0] * (count - len(values)))


def pack_global_bg_palette_key(asset, base_dir):
    if asset.get("background_palette_reference_plan") is not None:
        return tuple(
            rgb15(color)
            for bank in background_palette_reference_plan(asset, base_dir)["banks"]
            for color in bank
            if color is not None
        )
    if asset.get("background_palette_reference_colors") is not None:
        return tuple(
            rgb15(color)
            for color in background_palette_reference_plan(asset, base_dir)["colors"]
        )
    if base_dir is None or asset.get("kind", "bg") not in ("bg", "affine_bg", "indexed_bg", "paged_bg") or not asset.get("png"):
        return None
    _width, _height, colors, _indices = read_png(base_dir / asset["png"], max_colors=224 if asset.get("kind") == "paged_bg" else 256)
    return tuple(rgb15(color) for color in colors)


def palette_cache_tool_signature():
    return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def pack_palette_cache_signature(asset, base_dir, tool_signature):
    sources = {}
    for field in ("png", "background_palette_reference"):
        value = asset.get(field)
        if isinstance(value, str) and value and base_dir is not None:
            source = Path(base_dir) / value
            sources[field] = {"path": str(source.resolve()), "sha256": hashlib.sha256(source.read_bytes()).hexdigest()}
    payload = {"schema": 1, "tool": tool_signature, "asset": asset, "sources": sources}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def pack_palette_cache_entry(signature, obj_key, bg_key):
    entry = {"schema": 1, "signature": signature,
             "obj": list(obj_key) if obj_key is not None else None,
             "bg": list(bg_key) if bg_key is not None else None}
    entry["digest"] = hashlib.sha256(json.dumps(entry, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    return entry


def pack_cached_palette_keys(previous, signature):
    entry = previous.get("palette_cache") if isinstance(previous, dict) else None
    if not isinstance(entry, dict) or entry.get("schema") != 1 or entry.get("signature") != signature:
        return None
    if "obj" not in entry or "bg" not in entry:
        return None
    obj_key, bg_key = entry["obj"], entry["bg"]
    for key, maximum in ((obj_key, 256), (bg_key, 256)):
        if key is not None and (not isinstance(key, list) or len(key) > maximum
                                or any(type(value) is not int or not 0 <= value <= 32767 for value in key)):
            return None
    if obj_key is not None and len(obj_key) not in (16, OBJ_MASTER_PALETTE_COLORS, 256):
        return None
    verified = pack_palette_cache_entry(signature, obj_key, bg_key)
    if entry.get("digest") != verified["digest"]:
        return None
    return tuple(obj_key) if obj_key is not None else None, tuple(bg_key) if bg_key is not None else None


def pack_asset_resources(asset, base_dir):
    resources = {}
    if asset.get("kind") == "palette":
        resources[inline_palette_resource(asset)] = 16
    elif "png" in asset:
        resources.update(pack_png_resources(asset, base_dir))
    manual = asset.get("resources", {})
    if manual is not None and not isinstance(manual, dict):
        raise SystemExit("resources precisa ser objeto")
    for key, value in manual.items():
        if key not in PACK_RESOURCE_LIMITS and key not in ("bitmap_pixels", "palette_colors", "tilemap_entries", "tilemap_width", "tilemap_height", "sprite_frames"):
            raise SystemExit(f"recurso de packing desconhecido: {key}")
        resources[key] = resources.get(key, 0) + require_int(value, key, 0, 0x7FFFFFFF)
    return resources


def pack_file_fingerprint(path):
    data = Path(path).read_bytes()
    return {
        "path": str(path),
        "size": len(data),
        "crc32": f"{zlib.crc32(data) & 0xFFFFFFFF:08x}",
    }


def pack_asset_source_fingerprint(asset, base_dir):
    source = {}
    if "png" in asset:
        source["png"] = pack_file_fingerprint(base_dir / asset["png"])
    if "audio_json" in asset:
        audio_path = base_dir / asset["audio_json"]
        source["audio_json"] = pack_file_fingerprint(audio_path)
        audio_data = json.loads(audio_path.read_text())
        references = []
        for entry in audio_data.get("tracker", []) + audio_data.get("pcm", []):
            for key in ("wav", "mod", "s3m", "vgm", "mod_sample", "s3m_sample"):
                if isinstance(entry.get(key), str): references.append(entry[key])
            for sample in entry.get("samples", []):
                if isinstance(sample, dict) and isinstance(sample.get("wav"), str): references.append(sample["wav"])
        if references:
            source["audio_sources"] = [pack_file_fingerprint(audio_path.parent / reference) for reference in sorted(set(references))]
    return source


def pack_asset_config_fingerprint(asset):
    allocation_only_keys = {
        "bank_group",
        "bank_groups",
        "id",
        "name",
        "optional",
        "placement",
        "resources",
        "room",
        "template",
    }
    output_config = {
        key: value
        for key, value in asset.items()
        if key not in allocation_only_keys
    }
    encoded = json.dumps(output_config, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return f"{zlib.crc32(encoded) & 0xFFFFFFFF:08x}"


def pack_asset_resource_config_fingerprint(asset):
    resource_config = {
        key: asset[key]
        for key in (
            "kind",
            "optimize_affine_tiles",
            "affine_tile_budget",
            "optimize_background_tiles",
            "background_tile_budget",
            "oam_sprites",
            "png",
            "resources",
            "sprite_height",
            "sprite_width",
            "sprite_bpp",
            "stream_frames",
            "transparent_color_index",
            "background_palette_reference_colors",
            "background_palette_reference_plan",
            "object_palette_values",
            "object_palette_plan",
            "palette_slot",
            "palette_values",
            "compression_policy",
            "paged_palette_owner",
        )
        if key in asset
    }
    encoded = json.dumps(resource_config, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return f"{zlib.crc32(encoded) & 0xFFFFFFFF:08x}"


def pack_asset_fingerprint(asset, resources, source, config_fingerprint):
    payload = {
        "name": asset.get("name", ""),
        "kind": asset.get("kind", "bg"),
        "config": config_fingerprint,
        "resources": resources,
        "source": source,
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {
        "crc32": f"{zlib.crc32(encoded) & 0xFFFFFFFF:08x}",
        "source": source,
    }


def pack_cached_asset_resources(asset_id, config_fingerprint, source, previous_assets):
    previous = previous_assets.get(asset_id)
    if previous is None:
        return None
    resources = previous.get("resources")
    if (
        previous.get("resource_config_fingerprint") != config_fingerprint
        or previous.get("source") != source
        or not isinstance(resources, dict)
    ):
        return None
    return dict(resources)


def pack_previous_assets(previous_report):
    if previous_report is None:
        return {}
    allocations = previous_report.get("allocations", [])
    if not isinstance(allocations, list):
        raise SystemExit("previous pack report precisa conter allocations[]")
    previous = {}
    for allocation in allocations:
        if not isinstance(allocation, dict):
            continue
        asset_id = allocation.get("id", allocation.get("name"))
        if isinstance(asset_id, str) and asset_id:
            previous[asset_id] = allocation
    return previous


def pack_status_for_asset(asset_id, fingerprint, previous_assets):
    previous = previous_assets.get(asset_id)
    if previous is None:
        return "new"
    if previous.get("fingerprint") == fingerprint:
        return "unchanged"
    return "changed"


def pack_change_reason_for_asset(asset_id, fingerprint, resources, source, previous_assets):
    previous = previous_assets.get(asset_id)
    if previous is None:
        return "new_asset"
    if previous.get("fingerprint") == fingerprint:
        return "fingerprint_match"
    if previous.get("resources") != resources:
        return "resources_changed"
    if previous.get("source") != source:
        return "source_changed"
    return "metadata_changed"


def pack_incremental_summary(allocations, previous_assets):
    present_ids = set()
    summary = {
        "new": [],
        "changed": [],
        "unchanged": [],
        "removed": [],
    }
    for allocation in allocations:
        asset_id = allocation["id"]
        present_ids.add(asset_id)
        status = allocation["status"]
        if status in summary:
            summary[status].append(asset_id)
    for asset_id in sorted(previous_assets.keys()):
        if asset_id not in present_ids:
            summary["removed"].append(asset_id)
    return {
        "new": len(summary["new"]),
        "changed": len(summary["changed"]),
        "unchanged": len(summary["unchanged"]),
        "removed": len(summary["removed"]),
        "assets": summary,
    }


def pack_rebuild_plan(incremental):
    assets = incremental.get("assets", {})
    generate = sorted(assets.get("new", []) + assets.get("changed", []))
    skip = sorted(assets.get("unchanged", []))
    remove = sorted(assets.get("removed", []))
    return {
        "generate": len(generate),
        "skip": len(skip),
        "remove": len(remove),
        "assets": {
            "generate": generate,
            "skip": skip,
            "remove": remove,
        },
    }


def pack_safe_identifier(value):
    result = []
    for char in str(value):
        if char.isalnum() or char == "_":
            result.append(char.lower())
        else:
            result.append("_")
    identifier = "".join(result).strip("_")
    if not identifier:
        identifier = "asset"
    if identifier[0].isdigit():
        identifier = f"asset_{identifier}"
    return identifier


def pack_asset_bank_group(asset):
    group = asset.get("bank_group", asset.get("room", asset.get("group", "global")))
    if group is None:
        group = "global"
    if not isinstance(group, str) or not group.strip():
        raise SystemExit("asset.bank_group precisa ser string nao vazia quando informado")
    return group


def pack_asset_bank_groups(asset, primary_group):
    declared = asset.get("bank_groups", [])
    if declared is None:
        declared = []
    if not isinstance(declared, list):
        raise SystemExit("asset.bank_groups precisa ser array de strings quando informado")
    groups = [primary_group]
    for group in declared:
        if not isinstance(group, str) or not group.strip():
            raise SystemExit("asset.bank_groups[] precisa ser string nao vazia")
        if group not in groups:
            groups.append(group)
    return groups


def pack_asset_room(asset, bank_group):
    room = asset.get("room", bank_group)
    if room is None:
        room = "global"
    if not isinstance(room, str) or not room.strip():
        raise SystemExit("asset.room precisa ser string nao vazia quando informado")
    return room


def pack_asset_template(asset):
    template = asset.get("template", asset.get("runtime_profile", asset.get("genre", "global")))
    if template is None:
        template = "global"
    if not isinstance(template, str) or not template.strip():
        raise SystemExit("asset.template precisa ser string nao vazia quando informado")
    return template


def pack_assetc_args_for_asset(asset, symbol, header):
    args = []
    if "png" in asset:
        args.append(asset["png"])
    else:
        args.append("<asset-pack-entry>")
    args.extend(["-o", header, "-n", symbol])

    kind = pack_asset_kind(asset)
    if "destination_tile" in asset:
        args.extend(["--destination-tile", str(asset["destination_tile"])])
    if "palette_bank" in asset:
        args.extend(["--palette-bank", str(asset["palette_bank"])])
    if kind == "obj" or asset.get("object_tiles"):
        args.append("--object-tiles")
    if kind == "affine_bg":
        args.append("--affine-tilemap")
    if kind in ("indexed_bg", "paged_bg"):
        args.append("--paged-tilemap" if kind == "paged_bg" else "--indexed-tilemap")
    background_bpp = int(asset.get("background_bpp", 8 if kind in ("affine_bg", "indexed_bg", "paged_bg") else 4))
    if kind == "affine_bg":
        if background_bpp != 8:
            raise SystemExit(f"{asset.get('name', 'asset')}: affine_bg exige background_bpp 8")
        args.extend(["--background-bpp", "8"])
    elif kind in ("indexed_bg", "paged_bg"):
        if background_bpp != 8:
            raise SystemExit(f"{asset.get('name', 'asset')}: indexed_bg exige background_bpp 8")
        args.extend(["--background-bpp", "8"])
    elif background_bpp != 4:
        raise SystemExit(f"{asset.get('name', 'asset')}: background_bpp suporta somente 4")
    if asset.get("optimize_background_tiles"):
        args.extend([
            "--optimize-background-tiles",
            "--background-tile-budget",
            str(pack_background_tile_budget(asset)),
        ])
    if "background_palette_banks" in asset:
        args.extend(["--background-palette-banks", str(pack_background_palette_banks(asset))])
    if "background_palette_reference" in asset:
        args.extend(["--background-palette-reference", str(asset["background_palette_reference"])])
    if kind in ("bitmap3", "bitmap4", "bitmap5"):
        args.extend(["--bitmap-mode", kind[-1]])
    if "sprite_width" in asset:
        args.extend(["--sprite-width", str(asset["sprite_width"])])
    if "sprite_height" in asset:
        args.extend(["--sprite-height", str(asset["sprite_height"])])
    if "sprite_bpp" in asset:
        args.extend(["--sprite-bpp", str(asset["sprite_bpp"])])
    if asset.get("stream_frames"):
        args.append("--stream-frames")
    if "frame_duration" in asset:
        args.extend(["--frame-duration", str(asset["frame_duration"])])
    if asset.get("rle_tilemap"):
        args.append("--rle-tilemap")
    if asset.get("lz77_tilemap"):
        args.append("--lz77-tilemap")
    if asset.get("lz77_tiles"):
        args.append("--lz77-tiles")
    if asset.get("lz77_palette"):
        args.append("--lz77-palette")
    if asset.get("huffman_tilemap"):
        args.append("--huffman-tilemap")
    if asset.get("huffman_tiles"):
        args.append("--huffman-tiles")
    if asset.get("huffman_palette"):
        args.append("--huffman-palette")
    if "collision_color_index" in asset:
        args.extend(["--collision-color-index", str(asset["collision_color_index"])])
    if "slope_color_indexes" in asset:
        args.extend(["--slope-color-indexes", str(asset["slope_color_indexes"])])
    if asset.get("audio_json"):
        args.append("--audio-json")
    return args


def pack_asset_with_allocations(asset, allocation):
    resolved = dict(asset)
    if isinstance(allocation, dict) and "object_palette_plan" in allocation:
        resolved["object_palette_plan"] = allocation["object_palette_plan"]
    allocations = allocation.get("allocations", {}) if isinstance(allocation, dict) else {}
    if not isinstance(allocations, dict):
        return resolved

    kind = pack_asset_kind(resolved)
    background_bpp = int(resolved.get("background_bpp", 8 if kind in ("affine_bg", "indexed_bg", "paged_bg") else 4))
    if kind == "affine_bg":
        if background_bpp != 8:
            raise SystemExit(f"{resolved.get('name', 'asset')}: affine_bg exige background_bpp 8")
    elif kind in ("indexed_bg", "paged_bg"):
        if background_bpp != 8:
            raise SystemExit(f"{resolved.get('name', 'asset')}: indexed_bg exige background_bpp 8")
        return resolved
    elif background_bpp != 4:
        raise SystemExit(f"{resolved.get('name', 'asset')}: background_bpp suporta somente 4")
    if kind == "palette":
        palette_resource = inline_palette_resource(resolved)
        palette_allocation = allocations.get(palette_resource)
        if isinstance(palette_allocation, dict) and "start" in palette_allocation:
            palette_start = int(palette_allocation["start"])
            if palette_start % 16 != 0:
                raise SystemExit(f"{palette_resource}: inicio {palette_start} precisa estar alinhado a banco de 16 cores")
            resolved["palette_bank"] = palette_start // 16
        return resolved

    object_tiles = kind == "obj" or bool(resolved.get("object_tiles"))
    tile_resource = "obj_tiles" if object_tiles else "affine_bg_tiles" if kind == "affine_bg" else "bg_tiles"
    palette_resource = "obj_palette_colors" if object_tiles else "bg_palette_colors"

    tile_allocation = allocations.get(tile_resource)
    if isinstance(tile_allocation, dict) and "start" in tile_allocation:
        tile_start = int(tile_allocation["start"])
        resolved["destination_tile"] = tile_start

    palette_allocation = allocations.get(palette_resource)
    if isinstance(palette_allocation, dict) and "start" in palette_allocation:
        palette_start = int(palette_allocation["start"])
        if palette_start % 16 != 0:
            raise SystemExit(f"{palette_resource}: inicio {palette_start} precisa estar alinhado a banco de 16 cores")
        resolved["palette_bank"] = palette_start // 16
    if resolved.get("object_palette_plan") is not None:
        resolved["palette_bank"] = resolved["object_palette_plan"]["palette_bank"]
    return resolved


def pack_derived_tilemap_values(asset, base_dir, allocation):
    kind = asset.get("kind", "bg")
    if base_dir is None or "png" not in asset or kind != "bg":
        return None
    resolved_asset = pack_asset_with_allocations(asset, allocation)
    width, height, colors, indices, transparent_index = read_png(
        base_dir / resolved_asset["png"], max_colors=256, include_transparency=True
    )
    if int(resolved_asset.get("background_bpp", 4)) != 4:
        raise SystemExit(f"{resolved_asset.get('name', 'asset')}: background_bpp suporta somente 4")
    background = build_cached_4bpp_background(
        width,
        height,
        colors,
        indices,
        transparent_index,
        optimize_tile_budget=pack_background_tile_budget(resolved_asset),
        return_optimization=pack_background_tile_budget(resolved_asset) is not None,
        max_palette_banks=pack_background_palette_banks(resolved_asset),
        reference_plan=background_palette_reference_plan(resolved_asset, base_dir),
    )
    _palette, _tiles, tilemap_entries, _tilemap_width, _tilemap_height = background[:5]
    destination_tile = int(resolved_asset.get("destination_tile", 0))
    palette_bank = int(resolved_asset.get("palette_bank", 0))
    return [
        destination_tile + (entry & 0x0FFF) + ((palette_bank + (entry >> 12)) << 12)
        for entry in tilemap_entries
    ]


def pack_previous_export_headers(previous_report):
    if not isinstance(previous_report, dict):
        return {}
    export_plan = previous_report.get("export_plan", {})
    headers = export_plan.get("headers", []) if isinstance(export_plan, dict) else []
    if not isinstance(headers, list):
        return {}
    return {
        header["id"]: header
        for header in headers
        if isinstance(header, dict) and isinstance(header.get("id"), str)
    }


def pack_export_header_entry(asset, allocation, base_dir=None, previous_header=None, force_generate=False):
    asset_id = allocation["id"]
    symbol = asset.get("symbol", pack_safe_identifier(asset_id))
    header = asset.get("header", f"{symbol}.hpp")
    if not isinstance(header, str) or not header:
        raise SystemExit("asset.header precisa ser string nao vazia quando informado")
    if not isinstance(symbol, str) or not symbol:
        raise SystemExit("asset.symbol precisa ser string nao vazia quando informado")
    inputs = []
    if "png" in asset:
        inputs.append(asset["png"])
    if "audio_json" in asset:
        inputs.append(asset.get("audio_json"))
    inputs = [item for item in inputs if item]
    resolved_asset = pack_asset_with_allocations(asset, allocation)
    result = {
        "id": asset_id,
        "name": allocation["name"],
        "kind": allocation["kind"],
        "header": header,
        "symbol": symbol,
        "status": allocation["status"],
        "change_reason": allocation["change_reason"],
        "generate": force_generate or (allocation["status"] != "unchanged" and not allocation.get("omitted", False) and ("png" in asset or "audio_json" in asset or asset.get("kind") == "palette")),
        "omitted": bool(allocation.get("omitted", False)),
        "optional": bool(allocation.get("optional", False)),
        "inputs": inputs,
        "assetc_args": pack_assetc_args_for_asset(resolved_asset, symbol, header),
        **({"obj_pixel_options": {key: resolved_asset[key] for key in ("sprite_bpp", "transparent_color_index", "reserve_obj_transparent_color", "object_palette_values", "object_palette_plan") if key in resolved_asset}} if resolved_asset.get("kind") == "obj" else {}),
        **({"compression_policy": resolved_asset["compression_policy"]} if "compression_policy" in resolved_asset else {}),
        "resources": allocation["resources"],
        "allocations": allocation["allocations"],
    }
    previous_derived = previous_header.get("derived") if isinstance(previous_header, dict) else None
    if (
        not force_generate
        and allocation["status"] == "unchanged"
        and isinstance(previous_derived, dict)
        and previous_header.get("allocations") == allocation["allocations"]
    ):
        result["derived"] = previous_derived
        result["derived_cache"] = "reused"
    else:
        tilemap_values = pack_derived_tilemap_values(asset, base_dir, allocation)
        if tilemap_values is not None:
            result["derived"] = {"tilemap_values": tilemap_values}
            result["derived_cache"] = "computed"
    return result


def pack_export_plan(assets, allocations, incremental, base_dir, previous_report=None):
    previous_export_plan = previous_report.get("export_plan") if isinstance(previous_report, dict) else None
    header_contract_revision = not (
        isinstance(previous_export_plan, dict)
        and previous_export_plan.get("schema") == ASSETC_EXPORT_PLAN_SCHEMA
    )
    previous_headers = {} if header_contract_revision else pack_previous_export_headers(previous_report)
    headers = []
    for asset, allocation in zip(assets, allocations):
        headers.append(pack_export_header_entry(
            asset,
            allocation,
            base_dir,
            previous_headers.get(allocation["id"]),
            force_generate=header_contract_revision,
        ))
    removed = incremental.get("assets", {}).get("removed", [])
    return {
        "schema": ASSETC_EXPORT_PLAN_SCHEMA,
        "header_count": len(headers),
        "generate_count": sum(1 for header in headers if header["generate"]),
        "skip_count": sum(1 for header in headers if not header["generate"]),
        "remove_count": len(removed),
        "headers": headers,
        "removed_headers": sorted(removed),
    }


def pack_resource_bank_summary(pools):
    banks = {}
    bank_sizes = {
        "bg_tiles": 256,
        "obj_tiles": 256,
        "affine_bg_tiles": 256,
        "bg_palette_colors": 16,
        "obj_palette_colors": 16,
    }
    for resource, bank_size in bank_sizes.items():
        pool = pools.get(resource)
        if pool is None:
            continue
        resource_banks = []
        for start in range(0, len(pool), bank_size):
            chunk = pool[start:start + bank_size]
            used = sum(1 for value in chunk if value)
            resource_banks.append({
                "index": start // bank_size,
                "start": start,
                "end": start + len(chunk),
                "used": used,
                "capacity": len(chunk),
                "remaining": len(chunk) - used,
            })
        banks[resource] = resource_banks
    return banks


def pack_largest_free_block(pool):
    largest = 0
    current = 0
    for used in pool:
        if used:
            largest = max(largest, current)
            current = 0
        else:
            current += 1
    return max(largest, current)


def pack_fragment_count(pool):
    fragments = 0
    in_free = False
    for used in pool:
        if not used and not in_free:
            fragments += 1
            in_free = True
        elif used:
            in_free = False
    return fragments


def pack_fragmentation_report(pools):
    report = {}
    for resource, pool in pools.items():
        used = sum(1 for value in pool if value)
        capacity = len(pool)
        report[resource] = {
            "used": used,
            "capacity": capacity,
            "remaining": capacity - used,
            "largest_free_block": pack_largest_free_block(pool),
            "free_fragment_count": pack_fragment_count(pool),
        }
    return report


def pack_resource_bank_plan(allocations):
    plan = []
    shared_plans = {}
    for allocation in allocations:
        asset_id = pack_safe_identifier(allocation.get("id", allocation.get("name", "asset")))
        group = allocation.get("bank_group", "global")
        asset_allocations = allocation.get("allocations", {})
        if not isinstance(asset_allocations, dict):
            continue
        for resource, item in sorted(asset_allocations.items()):
            kind = PACK_RESOURCE_BANK_KINDS.get(resource)
            if kind is None:
                continue
            if not isinstance(item, dict):
                continue
            palette_plan = allocation.get("object_palette_plan") if resource == "obj_palette_colors" else None
            if palette_plan is None and item.get("shared_with"):
                continue
            groups = allocation.get("bank_groups", [group])
            start = int(item.get("start", 0))
            source_offset = 0
            count = int(item.get("count", 0))
            if palette_plan is not None:
                groups = palette_plan["groups"]
                source_offset = palette_plan.get("shared_bank_colors", 0)
                start += source_offset
                count -= source_offset
                key = (start, tuple(palette_plan["values"]))
                if key in shared_plans:
                    shared = shared_plans[key]
                    shared["groups"] = sorted(set(shared["groups"]).union(groups))
                    if "global" in shared["groups"]:
                        shared["group"] = "global"
                    continue
            if count <= 0:
                continue
            bank = {
                "kind": kind,
                "start": start,
                **({"source_offset": source_offset} if source_offset else {}),
                "count": count,
                "alignment": PACK_RESOURCE_BANK_ALIGNMENT.get(resource, 1),
                "name": f"{asset_id}_{resource}",
                "asset": allocation.get("id", allocation.get("name", asset_id)),
                "resource": resource,
                "group": group,
                "groups": groups,
                "room": allocation.get("room", group),
                "template": allocation.get("template", "global"),
            }
            plan.append(bank)
            if palette_plan is not None:
                shared_plans[key] = bank
    return plan


def pack_resource_bank_groups(plan):
    grouped = {}
    for index, bank in enumerate(plan):
        primary_group = bank.get("group", "global")
        groups = bank.get("groups", [primary_group])
        if not isinstance(groups, list):
            groups = [primary_group]
        for group in groups:
            if not isinstance(group, str) or not group:
                group = "global"
            entry = grouped.setdefault(group, {
                "name": group,
                "bank_count": 0,
                "bank_indexes": [],
                "assets": [],
                "banks": [],
            })
            entry["bank_count"] += 1
            entry["bank_indexes"].append(index)
            asset_id = bank.get("asset")
            if isinstance(asset_id, str) and asset_id not in entry["assets"]:
                entry["assets"].append(asset_id)
            entry["banks"].append(bank)
    return [grouped[name] for name in sorted(grouped.keys())]


def pack_bank_usage_by_group(plan):
    grouped = {}
    for bank in plan:
        group_name = bank.get("group", "global")
        resource = bank.get("resource", "unknown")
        entry = grouped.setdefault(group_name, {
            "name": group_name,
            "bank_count": 0,
            "asset_count": 0,
            "assets": [],
            "resources": {},
        })
        entry["bank_count"] += 1
        asset_id = bank.get("asset")
        if isinstance(asset_id, str) and asset_id not in entry["assets"]:
            entry["assets"].append(asset_id)
            entry["asset_count"] += 1
        resource_entry = entry["resources"].setdefault(resource, {
            "count": 0,
            "bank_count": 0,
        })
        resource_entry["count"] += int(bank.get("count", 0))
        resource_entry["bank_count"] += 1
    return [grouped[name] for name in sorted(grouped.keys())]


def pack_group_pressure_report(plan):
    grouped = {}
    for bank in plan:
        resource = bank.get("resource", "unknown")
        capacity = PACK_RESOURCE_LIMITS.get(resource, 0)
        primary_group = bank.get("group", "global")
        groups = bank.get("groups", [primary_group])
        if not isinstance(groups, list) or not groups:
            groups = [primary_group]
        normalized_groups = []
        for group_name in groups:
            if not isinstance(group_name, str) or not group_name:
                group_name = "global"
            if group_name not in normalized_groups:
                normalized_groups.append(group_name)
        for group_name in normalized_groups:
            entry = grouped.setdefault(group_name, {
                "name": group_name,
                "bank_count": 0,
                "asset_count": 0,
                "assets": [],
                "resources": {},
            })
            entry["bank_count"] += 1
            asset_id = bank.get("asset")
            if isinstance(asset_id, str) and asset_id not in entry["assets"]:
                entry["assets"].append(asset_id)
                entry["asset_count"] += 1
            resource_entry = entry["resources"].setdefault(resource, {
                "requested": 0,
                "capacity": capacity,
                "remaining_after_group": capacity,
                "percent_of_pool": 0,
                "bank_count": 0,
            })
            requested = int(bank.get("count", 0))
            resource_entry["requested"] += requested
            resource_entry["bank_count"] += 1
            if capacity > 0:
                resource_entry["remaining_after_group"] = max(0, capacity - resource_entry["requested"])
                resource_entry["percent_of_pool"] = (resource_entry["requested"] * 100) // capacity
    return [grouped[name] for name in sorted(grouped.keys())]


def pack_pressure_report_by_key(allocations, key):
    grouped = {}
    for allocation in allocations:
        group_name = allocation.get(key, allocation.get("bank_group", "global"))
        if not isinstance(group_name, str) or not group_name:
            group_name = "global"
        entry = grouped.setdefault(group_name, {
            "name": group_name,
            "asset_count": 0,
            "omitted_asset_count": 0,
            "assets": [],
            "resources": {},
            "severity": "ok",
        })
        asset_id = allocation.get("id", allocation.get("name"))
        if isinstance(asset_id, str) and asset_id not in entry["assets"]:
            entry["assets"].append(asset_id)
            entry["asset_count"] += 1
        if allocation.get("omitted"):
            entry["omitted_asset_count"] += 1
        resources = allocation.get("resources", {})
        if not isinstance(resources, dict):
            continue
        allocated = allocation.get("allocations", {})
        if not isinstance(allocated, dict):
            allocated = {}
        for resource, requested in sorted(resources.items()):
            if resource not in PACK_RESOURCE_LIMITS:
                continue
            capacity = PACK_RESOURCE_LIMITS[resource]
            resource_entry = entry["resources"].setdefault(resource, {
                "requested": 0,
                "allocated": 0,
                "capacity": capacity,
                "percent_of_pool": 0,
                "remaining_after_request": capacity,
            })
            requested_count = int(requested)
            allocated_count = int(allocated.get(resource, {}).get("count", 0)) if isinstance(allocated.get(resource), dict) else 0
            resource_entry["requested"] += requested_count
            resource_entry["allocated"] += allocated_count
            if capacity > 0:
                resource_entry["remaining_after_request"] = max(0, capacity - resource_entry["requested"])
                resource_entry["percent_of_pool"] = (resource_entry["requested"] * 100) // capacity
                if resource_entry["percent_of_pool"] >= PACK_BUDGET_WARNING_PERCENT:
                    entry["severity"] = "warning"
                if resource_entry["requested"] > capacity:
                    entry["severity"] = "error"
    return sorted(
        grouped.values(),
        key=lambda item: (item.get("omitted_asset_count", 0) > 0, item.get("name", "")),
    )


def pack_resident_sets(pack_data, allocations):
    declared = pack_data.get("resident_sets", [])
    if not isinstance(declared, list):
        raise SystemExit("resident_sets precisa ser lista")
    known_groups = {
        group
        for allocation in allocations
        for group in allocation.get("bank_groups", [allocation.get("bank_group", "global")])
        if isinstance(group, str) and group
    }
    result = []
    seen_ids = set()
    claimed_groups = set()
    for index, item in enumerate(declared):
        path = f"resident_sets[{index}]"
        if not isinstance(item, dict):
            raise SystemExit(f"{path} precisa ser objeto")
        set_id = item.get("id")
        groups = item.get("groups")
        maximum = item.get("max_resident_groups")
        if not isinstance(set_id, str) or not set_id:
            raise SystemExit(f"{path}.id precisa ser string nao vazia")
        if set_id in seen_ids:
            raise SystemExit(f"{path}.id duplicado: {set_id}")
        if not isinstance(groups, list) or not groups or any(not isinstance(group, str) or not group for group in groups):
            raise SystemExit(f"{path}.groups precisa ser lista nao vazia de strings")
        if len(set(groups)) != len(groups):
            raise SystemExit(f"{path}.groups nao pode conter duplicatas")
        missing = [group for group in groups if group not in known_groups]
        if missing:
            raise SystemExit(f"{path}.groups referencia grupos inexistentes: {', '.join(missing)}")
        overlap = [group for group in groups if group in claimed_groups]
        if overlap:
            raise SystemExit(f"{path}.groups ja pertence a outro resident_set: {', '.join(overlap)}")
        if not isinstance(maximum, int) or isinstance(maximum, bool) or maximum < 1 or maximum > len(groups):
            raise SystemExit(f"{path}.max_resident_groups precisa estar entre 1 e len(groups)")
        seen_ids.add(set_id)
        claimed_groups.update(groups)
        result.append({
            "id": set_id,
            "room": item.get("room", set_id),
            "groups": list(groups),
            "max_resident_groups": maximum,
        })
    return result


def pack_resident_pressure_report(resident_sets, group_pressure_report):
    groups_by_name = {item.get("name"): item for item in group_pressure_report}
    report = []
    for resident_set in resident_sets:
        resources = {}
        resource_names = {
            resource
            for group in resident_set["groups"]
            for resource in groups_by_name.get(group, {}).get("resources", {})
        }
        for resource in sorted(resource_names):
            capacity = PACK_RESOURCE_LIMITS.get(resource, 0)
            values = sorted((
                int(groups_by_name.get(group, {}).get("resources", {}).get(resource, {}).get("requested", 0))
                for group in resident_set["groups"]
            ), reverse=True)
            requested = sum(values[:resident_set["max_resident_groups"]])
            resources[resource] = {
                "requested": requested,
                "capacity": capacity,
                "percent_of_pool": (requested * 100) // capacity if capacity else 0,
                "remaining_after_request": max(0, capacity - requested),
            }
        report.append({**resident_set, "resources": resources})
    return report


def pack_catalog_pressure_report(room_pressure_report):
    return [{
        "name": item.get("name"),
        "assets": item.get("assets", []),
        "resources": {
            resource: int(usage.get("requested", 0))
            for resource, usage in item.get("resources", {}).items()
        },
    } for item in room_pressure_report]


def pack_pool_reports(pools):
    reports = {}
    for resource, pool in pools.items():
        used = sum(1 for value in pool if value)
        capacity = len(pool)
        percent_used = (used * 100) // capacity if capacity else 0
        free_block_count = pack_fragment_count(pool)
        largest_free_block = pack_largest_free_block(pool)
        if used > capacity:
            severity = "error"
        elif percent_used >= PACK_BUDGET_WARNING_PERCENT or (free_block_count > 1 and largest_free_block < max(1, capacity // 4)):
            severity = "warning"
        else:
            severity = "ok"
        reports[resource] = {
            "pool": resource,
            "used": used,
            "capacity": capacity,
            "remaining": capacity - used,
            "percent_used": percent_used,
            "largest_free_block": largest_free_block,
            "free_block_count": free_block_count,
            "severity": severity,
        }
    return reports


def pack_asset_reports(allocations):
    reports = {}
    for allocation in allocations:
        asset_id = allocation.get("id", allocation.get("name"))
        if not isinstance(asset_id, str) or not asset_id:
            continue
        reports[asset_id] = {
            "id": asset_id,
            "name": allocation.get("name"),
            "kind": allocation.get("kind"),
            "room": allocation.get("room"),
            "group": allocation.get("bank_group"),
            "template": allocation.get("template"),
            "optional": bool(allocation.get("optional")),
            "omitted": bool(allocation.get("omitted")),
            "ok": bool(allocation.get("ok")),
            "status": allocation.get("status"),
            "change_reason": allocation.get("change_reason"),
            "resources": allocation.get("resources", {}),
            "allocations": allocation.get("allocations", {}),
            "diagnostics": allocation.get("diagnostics", []),
        }
    return reports


def pack_split_recommendations(allocations, room_pressure_report, group_pressure_report):
    recommendations = []
    bank_sizes = {
        "bg_tiles": 256,
        "obj_tiles": 256,
        "affine_bg_tiles": 256,
        "bg_palette_colors": 16,
        "obj_palette_colors": 16,
        "oam_sprites": 32,
        "pcm_bytes": 32768,
    }
    for allocation in allocations:
        resources = allocation.get("resources", {})
        if not isinstance(resources, dict):
            continue
        for resource, count in sorted(resources.items()):
            threshold = bank_sizes.get(resource)
            if threshold is None or int(count) <= threshold:
                continue
            recommendations.append({
                "scope": "asset",
                "asset": allocation.get("id", allocation.get("name")),
                "room": allocation.get("room"),
                "group": allocation.get("bank_group"),
                "resource": resource,
                "requested": int(count),
                "threshold": threshold,
                "reason": "asset_exceeds_single_bank",
                "action": "Divida o asset em bancos menores ou carregue partes por cena/room.",
            })
    for report_name, report_items in (("room", room_pressure_report), ("group", group_pressure_report)):
        for item in report_items:
            resources = item.get("resources", {})
            if not isinstance(resources, dict):
                continue
            for resource, usage in sorted(resources.items()):
                if not isinstance(usage, dict):
                    continue
                percent = int(usage.get("percent_of_pool", 0))
                if percent < PACK_SPLIT_RECOMMENDATION_PERCENT:
                    continue
                recommendations.append({
                    "scope": report_name,
                    "name": item.get("name"),
                    "resource": resource,
                    "requested": int(usage.get("requested", 0)),
                    "capacity": int(usage.get("capacity", 0)),
                    "percent_of_pool": percent,
                    "reason": "scope_high_pool_pressure",
                    "action": "Separe esse conjunto em mais de um banco/room ou mova assets opcionais para prefetch tardio.",
                })
    return recommendations


def pack_compression_candidates(allocations):
    candidates = []
    for allocation in allocations:
        asset_id = allocation.get("id", allocation.get("name"))
        resources = allocation.get("resources", {})
        if not isinstance(resources, dict):
            continue
        if int(resources.get("tilemap_entries", 0)) >= 1024 or int(resources.get("bg_tiles", 0)) >= 128:
            candidates.append({
                "asset": asset_id,
                "resource": "tilemap_entries" if int(resources.get("tilemap_entries", 0)) >= 1024 else "bg_tiles",
                "strategy": "rle_or_lz77_or_huffman_tilemap",
                "reason": "large_repetitive_background_candidate",
            })
        if int(resources.get("pcm_bytes", 0)) >= 32768:
            candidates.append({
                "asset": asset_id,
                "resource": "pcm_bytes",
                "strategy": "resample_or_stream_pcm",
                "reason": "large_pcm_asset_candidate",
            })
        palette_total = int(resources.get("bg_palette_colors", 0)) + int(resources.get("obj_palette_colors", 0))
        if palette_total >= 128:
            candidates.append({
                "asset": asset_id,
                "resource": "palette_colors",
                "strategy": "palette_reduce_or_share_bank",
                "reason": "palette_pressure_candidate",
            })
    return candidates


def pack_required_asset_summary(allocations):
    required = [allocation for allocation in allocations if not allocation.get("optional")]
    failed = [allocation.get("id", allocation.get("name")) for allocation in required if not allocation.get("ok")]
    return {
        "ok": not failed,
        "count": len(required),
        "failed": failed,
    }


def pack_optional_asset_summary(allocations):
    optional = [allocation for allocation in allocations if allocation.get("optional")]
    omitted = [allocation.get("id", allocation.get("name")) for allocation in optional if allocation.get("omitted")]
    included = [allocation.get("id", allocation.get("name")) for allocation in optional if not allocation.get("omitted")]
    return {
        "count": len(optional),
        "included": included,
        "omitted": omitted,
        "fallback": "omit_optional_asset" if omitted else None,
    }


def pack_physical_budget(value):
    if value is None:
        return None
    if not isinstance(value, dict):
        raise SystemExit("physical_budget precisa ser objeto")
    schema = value.get("schema", 1)
    if schema != 1:
        raise SystemExit("physical_budget.schema precisa ser 1")
    audio_bytes_by_item = value.get("audio_bytes_by_item", {})
    if not isinstance(audio_bytes_by_item, dict):
        raise SystemExit("physical_budget.audio_bytes_by_item precisa ser objeto")
    normalized = {}
    for key, bytes_value in audio_bytes_by_item.items():
        if not isinstance(key, str) or not key:
            raise SystemExit("physical_budget.audio_bytes_by_item precisa usar chaves de string nao vazias")
        normalized[key] = require_int(
            bytes_value,
            f"physical_budget.audio_bytes_by_item.{key}",
            0,
            0x7FFFFFFF,
        )
    result = dict(value)
    result["schema"] = schema
    result["audio_bytes_by_item"] = normalized
    return result


def pack_production_summary(allocations, errors, overflow_report, split_recommendations, compression_candidates):
    required_summary = pack_required_asset_summary(allocations)
    optional_summary = pack_optional_asset_summary(allocations)
    blocking_overflows = [
        diagnostic for diagnostic in overflow_report
        if diagnostic.get("severity") == "error"
    ]
    return {
        "ready_for_large_project": not errors and not blocking_overflows,
        "required_asset_count": required_summary["count"],
        "required_failed_count": len(required_summary["failed"]),
        "optional_asset_count": optional_summary["count"],
        "optional_omitted_count": len(optional_summary["omitted"]),
        "split_recommendation_count": len(split_recommendations),
        "compression_candidate_count": len(compression_candidates),
        "blocking_overflow_count": len(blocking_overflows),
    }


def pack_template_limits_for(template):
    limits = PACK_PRODUCTION_PROFILE_LIMITS.get(template, PACK_PRODUCTION_PROFILE_LIMITS["global"])
    return {
        resource: {
            "warning_percent": warning,
            "error_percent": error,
        }
        for resource, (warning, error) in sorted(limits.items())
    }


def pack_limit_for_template_resource(template, resource):
    limits = PACK_PRODUCTION_PROFILE_LIMITS.get(template, PACK_PRODUCTION_PROFILE_LIMITS["global"])
    return limits.get(resource, PACK_PRODUCTION_PROFILE_LIMITS["global"].get(resource, (PACK_BUDGET_WARNING_PERCENT, 95)))


def pack_profile_scope_pressure(scope, name, template, resources):
    pressure_items = []
    severity = "ok"
    risk_score = 0
    for resource, usage in sorted(resources.items()):
        if not isinstance(usage, dict):
            continue
        percent = int(usage.get("percent_of_pool", 0))
        warning_percent, error_percent = pack_limit_for_template_resource(template, resource)
        item_severity = "ok"
        if percent >= error_percent:
            item_severity = "error"
            severity = "error"
        elif percent >= warning_percent:
            item_severity = "warning"
            if severity != "error":
                severity = "warning"
        risk_score = max(risk_score, percent)
        if item_severity != "ok":
            pressure_items.append({
                "resource": resource,
                "severity": item_severity,
                "requested": int(usage.get("requested", 0)),
                "capacity": int(usage.get("capacity", 0)),
                "percent_of_pool": percent,
                "warning_percent": warning_percent,
                "error_percent": error_percent,
                "action": "Reduza, comprima ou mova este recurso para outro banco/room antes de promover para beta ampla.",
            })
    return {
        "scope": scope,
        "name": name,
        "template": template,
        "severity": severity,
        "risk_score": risk_score,
        "pressure": pressure_items,
    }


def pack_production_ui_actions(pool_reports, overflow_report, split_recommendations, compression_candidates, pressure_gates):
    actions = []
    for diagnostic in overflow_report:
        severity = "warning" if diagnostic.get("fallback") == "omit_optional_asset" else "error"
        actions.append({
            "id": f"asset_overflow_{diagnostic.get('asset')}_{diagnostic.get('resource')}",
            "severity": severity,
            "scope": "asset",
            "asset": diagnostic.get("asset"),
            "resource": diagnostic.get("resource"),
            "message": diagnostic.get("message"),
            "action": "Marque como opcional, divida em bancos menores ou reduza o recurso solicitado.",
        })
    for recommendation in split_recommendations:
        actions.append({
            "id": f"split_{recommendation.get('scope')}_{recommendation.get('name', recommendation.get('asset'))}_{recommendation.get('resource')}",
            "severity": "warning",
            "scope": recommendation.get("scope"),
            "asset": recommendation.get("asset"),
            "name": recommendation.get("name"),
            "resource": recommendation.get("resource"),
            "message": recommendation.get("reason"),
            "action": recommendation.get("action"),
        })
    for candidate in compression_candidates:
        actions.append({
            "id": f"compress_{candidate.get('asset')}_{candidate.get('resource')}",
            "severity": "info",
            "scope": "asset",
            "asset": candidate.get("asset"),
            "resource": candidate.get("resource"),
            "message": candidate.get("reason"),
            "action": f"Aplicar estrategia {candidate.get('strategy')} quando o asset entrar em build beta.",
        })
    for resource, report in sorted(pool_reports.items()):
        if report.get("severity") == "ok":
            continue
        actions.append({
            "id": f"pool_{resource}_{report.get('severity')}",
            "severity": report.get("severity"),
            "scope": "pool",
            "resource": resource,
            "message": f"{resource}: {report.get('percent_used')}% usado, maior bloco livre {report.get('largest_free_block')}.",
            "action": "Rebalancear bancos ou reduzir assets antes de gerar candidatos para hardware real.",
        })
    for gate in pressure_gates:
        if gate.get("severity") == "ok":
            continue
        actions.append({
            "id": f"pressure_{gate.get('scope')}_{gate.get('name')}",
            "severity": gate.get("severity"),
            "scope": gate.get("scope"),
            "name": gate.get("name"),
            "resource": gate.get("pressure", [{}])[0].get("resource") if gate.get("pressure") else None,
            "message": f"{gate.get('scope')} {gate.get('name')} tem pressao {gate.get('severity')} ({gate.get('risk_score')}%).",
            "action": "Abrir painel de asset banking para distribuir esse escopo em bancos menores.",
        })
    return actions


def pack_production_profile(pack_data, allocations, pool_reports, room_pressure_report, template_pressure_report, group_pressure_report, resident_sets, resident_pressure_report, overflow_report, split_recommendations, compression_candidates):
    active_allocations = [allocation for allocation in allocations if not allocation.get("omitted")]
    room_pressure_report = pack_pressure_report_by_key(active_allocations, "room")
    template_pressure_report = pack_pressure_report_by_key(active_allocations, "template")
    group_pressure_report = pack_group_pressure_report(pack_resource_bank_plan(active_allocations))
    templates = sorted({
        allocation.get("template", "global")
        for allocation in active_allocations
        if isinstance(allocation.get("template", "global"), str)
    }) or ["global"]
    template_limits = { template: pack_template_limits_for(template) for template in templates }
    pressure_gates = []
    resident_groups = {group for resident_set in resident_sets for group in resident_set["groups"]}
    resident_rooms = {resident_set.get("room") for resident_set in resident_sets}
    resident_templates = {
        allocation.get("template", "global")
        for allocation in active_allocations
        if allocation.get("bank_group") in resident_groups
    }
    for item in room_pressure_report:
        if item.get("name") in resident_rooms:
            continue
        template = "global"
        for allocation in allocations:
            if allocation.get("room") == item.get("name"):
                template = allocation.get("template", "global")
                break
        pressure_gates.append(pack_profile_scope_pressure("room", item.get("name"), template, item.get("resources", {})))
    for item in template_pressure_report:
        template_allocations = [allocation for allocation in active_allocations if allocation.get("template", "global") == item.get("name")]
        if template_allocations and all(allocation.get("bank_group") in resident_groups for allocation in template_allocations):
            continue
        pressure_gates.append(pack_profile_scope_pressure("template", item.get("name"), item.get("name", "global"), item.get("resources", {})))
    for item in group_pressure_report:
        if item.get("name") in resident_groups:
            continue
        template = "global"
        for allocation in allocations:
            if allocation.get("bank_group") == item.get("name"):
                template = allocation.get("template", "global")
                break
        pressure_gates.append(pack_profile_scope_pressure("group", item.get("name"), template, item.get("resources", {})))
    for item in resident_pressure_report:
        template = next((
            allocation.get("template", "global")
            for allocation in active_allocations
            if allocation.get("bank_group") in item.get("groups", [])
        ), "global")
        resources = item.get("resources", {})
        gate = pack_profile_scope_pressure("resident_set", item.get("id"), template, resources)
        # Residência explícita pode ocupar exatamente o limite físico; isso é
        # atenção, não incompatibilidade. Somente exceder a capacidade bloqueia.
        if gate["severity"] == "error" and all(
            int(usage.get("requested", 0)) <= int(usage.get("capacity", 0))
            for usage in resources.values()
        ):
            gate["severity"] = "warning"
            for pressure in gate["pressure"]:
                if pressure["severity"] == "error":
                    pressure["severity"] = "warning"
        pressure_gates.append(gate)

    ui_actions = pack_production_ui_actions(pool_reports, overflow_report, split_recommendations, compression_candidates, pressure_gates)
    has_error = any(action.get("severity") == "error" for action in ui_actions)
    has_warning = any(action.get("severity") == "warning" for action in ui_actions)
    severity = "error" if has_error else ("warning" if has_warning else "ok")
    return {
        "id": pack_data.get("production_profile", pack_data.get("stress_profile", "default")),
        "schema": 1,
        "severity": severity,
        "ready_for_beta_export": severity != "error",
        "ready_for_primary_backend": False,
        "backend_policy": "parallel_until_manual_promotion",
        "templates": templates,
        "template_limits": template_limits,
        "pressure_gates": pressure_gates,
        "ui_actions": ui_actions,
        "ui_action_count": len(ui_actions),
        "manual_validation_required": [
            "manual_mgba_stress_smoke",
            "hardware_or_ci_validation",
            "gba_studio_engine_primary_rollout",
        ],
    }


def pack_background_reference_asset_id(asset, assets, base_dir):
    reference = asset.get("background_palette_reference")
    if not isinstance(reference, str) or not reference:
        return None
    reference_path = Path(reference)
    if not reference_path.is_absolute():
        reference_path = base_dir / reference_path
    try:
        reference_path = reference_path.resolve()
    except OSError:
        reference_path = reference_path.absolute()

    for candidate in assets:
        if not isinstance(candidate, dict) or not candidate.get("png"):
            continue
        candidate_path = Path(candidate["png"])
        if not candidate_path.is_absolute():
            candidate_path = base_dir / candidate_path
        try:
            candidate_path = candidate_path.resolve()
        except OSError:
            candidate_path = candidate_path.absolute()
        if candidate_path != reference_path:
            continue
        candidate_id = candidate.get("id", candidate.get("name"))
        return candidate_id if isinstance(candidate_id, str) and candidate_id else None
    return None


def pack_diagnostic(severity, code, message, resource=None, asset=None, used=None, capacity=None, **extra):
    diagnostic = {
        "severity": severity,
        "code": code,
        "message": message,
    }
    if resource is not None:
        diagnostic["resource"] = resource
    if asset is not None:
        diagnostic["asset"] = asset
    if used is not None:
        diagnostic["used"] = used
    if capacity is not None:
        diagnostic["capacity"] = capacity
    if used is not None and capacity:
        diagnostic["percent_used"] = (used * 100) // capacity
        diagnostic["remaining"] = capacity - used
    for key, value in extra.items():
        if value is not None:
            diagnostic[key] = value
    return diagnostic


def pack_budget_summary(usage):
    summary = {}
    for resource, item in usage.items():
        used = item["used"]
        capacity = item["capacity"]
        percent_used = (used * 100) // capacity if capacity else 0
        if used > capacity:
            severity = "error"
        elif percent_used >= PACK_BUDGET_WARNING_PERCENT:
            severity = "warning"
        else:
            severity = "ok"
        summary[resource] = {
            "used": used,
            "capacity": capacity,
            "remaining": item["remaining"],
            "percent_used": percent_used,
            "severity": severity,
        }
    return summary


def pack_budget_diagnostics(usage):
    diagnostics = []
    for resource, item in usage.items():
        used = item["used"]
        capacity = item["capacity"]
        if not capacity:
            continue
        percent_used = (used * 100) // capacity
        if percent_used >= PACK_BUDGET_WARNING_PERCENT:
            diagnostics.append(pack_diagnostic(
                "warning",
                "GBS_ASSET_PACK_BUDGET_NEAR_LIMIT",
                f"{resource}: uso em {percent_used}% do limite ({used}/{capacity})",
                resource=resource,
                used=used,
                capacity=capacity,
            ))
    return diagnostics


@background_cache_scope()
def emit_pack_report(pack_data, base_dir, previous_report=None):
    if not isinstance(pack_data, dict):
        raise SystemExit("pack json precisa ser objeto")
    assets = pack_data.get("assets", [])
    if not isinstance(assets, list):
        raise SystemExit("pack json precisa conter assets[]")
    physical_budget = pack_physical_budget(pack_data.get("physical_budget"))
    assets = plan_pack_obj_palettes(assets, base_dir)

    pools = { key: [False] * limit for key, limit in PACK_RESOURCE_LIMITS.items() }
    # BG0 usa o tile 0 como superficie transparente para UI, dialogo e HUD.
    # Se um tileset ocupar esse endereco, a camada vazia vira opaca e cobre OBJ/BG do mundo.
    pools["bg_tiles"][0] = True
    group_pools = {}
    reserve_pack_obj_palette_plans(assets, pools, group_pools)
    allocations = []
    errors = []
    diagnostics = []
    previous_assets = pack_previous_assets(previous_report)
    palette_tool_signature = palette_cache_tool_signature()
    seen_asset_ids = set()
    allocation_by_asset_id = {}
    fallback_applied = False
    # Paletas idênticas podem ocupar o mesmo banco físico dentro do mesmo
    # conjunto de pools. Isso vale tanto para assets globais quanto para
    # assets residentes somente em uma cena (por exemplo, fatias de um logo
    # de tela de título). O escopo inclui todos os bank_groups para evitar
    # compartilhar uma faixa que não esteja disponível em algum pool do
    # segundo asset.
    shared_obj_palettes = {}
    shared_bg_palettes = {}
    planned_obj_palettes = {}

    for asset_index, asset in enumerate(assets):
        if not isinstance(asset, dict):
            raise SystemExit("cada asset do pack precisa ser objeto")
        name = asset.get("name", f"asset_{asset_index}")
        if not isinstance(name, str) or not name:
            raise SystemExit("asset.name precisa ser string nao vazia")
        bank_group = pack_asset_bank_group(asset)
        bank_groups = pack_asset_bank_groups(asset, bank_group)
        if "global" in bank_groups:
            asset_pool_sets = [pools, *group_pools.values()]
        else:
            for group in bank_groups:
                if group not in group_pools:
                    group_pools[group] = {resource: list(pool) for resource, pool in pools.items()}
            asset_pool_sets = [group_pools[group] for group in bank_groups]
        obj_plan = asset.get("object_palette_plan")
        if obj_plan is not None:
            for group in obj_plan["groups"]:
                if group != "global" and group not in group_pools:
                    group_pools[group] = {resource: list(pool) for resource, pool in pools.items()}
        room = pack_asset_room(asset, bank_group)
        template = pack_asset_template(asset)
        asset_id = asset.get("id", name)
        if not isinstance(asset_id, str) or not asset_id:
            raise SystemExit("asset.id precisa ser string nao vazia quando informado")
        if asset_id in seen_asset_ids:
            raise SystemExit(f"asset.id duplicado no pack: {asset_id}")
        seen_asset_ids.add(asset_id)
        source = pack_asset_source_fingerprint(asset, base_dir)
        output_config_fingerprint = pack_asset_config_fingerprint(asset)
        resource_config_fingerprint = pack_asset_resource_config_fingerprint(asset)
        palette_signature = pack_palette_cache_signature(asset, base_dir, palette_tool_signature)
        previous_asset = previous_assets.get(asset_id)
        cached_palette = pack_cached_palette_keys(previous_asset, palette_signature)
        cached_resources = pack_cached_asset_resources(
            asset_id,
            resource_config_fingerprint,
            source,
            previous_assets,
        )
        # A changed reference, option, tool or damaged derived entry also makes
        # resource analysis unsafe. Reports without this entry seed only the
        # existing primary-source resource cache; references need fresh analysis.
        if cached_palette is None and isinstance(previous_asset, dict) and (
            "palette_cache" in previous_asset or asset.get("background_palette_reference")
        ):
            cached_resources = None
        resource_cache = "reused" if cached_resources is not None else "computed"
        if asset.get("kind") == "palette":
            # Famílias de paleta são tabelas RGB555 de autoria/exportação. Elas
            # não são uma segunda cópia residente do pool de paletas: os assets
            # BG/OBJ já recebem a família selecionada durante a preparação.
            resources = {}
            resource_cache = "compile_time"
        else:
            resources = cached_resources if cached_resources is not None else pack_asset_resources(asset, base_dir)
        fingerprint = pack_asset_fingerprint(
            asset,
            resources,
            source,
            output_config_fingerprint,
        )
        placement = asset.get("placement", {})
        if placement is not None and not isinstance(placement, dict):
            raise SystemExit("placement precisa ser objeto")
        asset_allocations = {}
        asset_errors = []
        asset_diagnostics = []
        optional = bool(asset.get("optional", False))
        omitted = False
        asset_pool_snapshots = [
            {key: list(value) for key, value in pool_set.items()}
            for pool_set in asset_pool_sets
        ]
        palette_scope = tuple(sorted(bank_groups))
        if cached_palette is None:
            palette_obj = pack_global_obj_palette_key(asset, base_dir)
            palette_bg = pack_global_bg_palette_key(asset, base_dir)
        else:
            palette_obj, palette_bg = cached_palette
        palette_cache = pack_palette_cache_entry(palette_signature, palette_obj, palette_bg)
        obj_palette_key = (
            palette_scope,
            palette_obj
        )
        bg_palette_key = (
            palette_scope,
            palette_bg
        )
        reference_asset_id = pack_background_reference_asset_id(asset, assets, base_dir)
        reference_allocation = allocation_by_asset_id.get(reference_asset_id)
        can_share_background_reference = (
            reference_allocation is not None
            and asset.get("kind", "bg") == "bg"
            and reference_allocation.get("kind", "bg") == "bg"
            and reference_allocation.get("bank_group") == bank_group
            and not reference_allocation.get("omitted", False)
        )

        for resource, count in sorted(resources.items()):
            if resource not in PACK_RESOURCE_LIMITS or count == 0:
                continue
            if resource == "obj_palette_colors" and obj_plan is not None:
                scope = (tuple(obj_plan["groups"]), obj_plan["palette_bank"], tuple(obj_plan["values"]))
                planned_obj_palettes.setdefault(scope, name)
                start = obj_plan["palette_bank"] * 16
                requested = (placement or {}).get(resource, {}).get("start")
                if requested is not None and requested != start:
                    raise SystemExit(f"{name}: paleta OBJ compartilhada exige inicio {start}; placement solicita {requested}")
                count = len(obj_plan["values"])
                asset_allocations[resource] = {"start": start, "count": count, "end": start + count, "shared_with": planned_obj_palettes[scope]}
                continue
            if can_share_background_reference and resource in ("bg_tiles", "bg_palette_colors"):
                reference_resources = reference_allocation.get("allocations", {})
                shared_range = reference_resources.get(resource)
                if (
                    isinstance(shared_range, dict)
                    and isinstance(shared_range.get("start"), int)
                    and isinstance(shared_range.get("count"), int)
                    and count <= shared_range["count"]
                ):
                    start = shared_range["start"]
                    asset_allocations[resource] = {
                        "start": start,
                        "count": count,
                        "end": start + count,
                        "shared_with": reference_asset_id,
                    }
                    continue
            if resource == "obj_palette_colors" and obj_palette_key[1] is not None:
                shared_palette = shared_obj_palettes.get(obj_palette_key)
                if shared_palette is not None:
                    start = shared_palette["start"]
                    asset_allocations[resource] = {
                        "start": start,
                        "count": count,
                        "end": start + count,
                        "shared_with": shared_palette["asset"],
                    }
                    continue
            if resource == "bg_palette_colors" and bg_palette_key[1] is not None:
                shared_palette = shared_bg_palettes.get(bg_palette_key)
                if shared_palette is not None:
                    start = shared_palette["start"]
                    asset_allocations[resource] = {
                        "start": start,
                        "count": count,
                        "end": start + count,
                        "shared_with": shared_palette["asset"],
                    }
                    continue
            allocation_pools = [pool_set[resource] for pool_set in asset_pool_sets]
            pool = allocation_pools[0]
            resource_placement = placement.get(resource, {}) if placement else {}
            if resource_placement is None:
                resource_placement = {}
            if not isinstance(resource_placement, dict):
                raise SystemExit(f"placement.{resource} precisa ser objeto")
            alignment = require_int(
                resource_placement.get("alignment", PACK_RESOURCE_BANK_ALIGNMENT.get(resource, 1)),
                f"{resource}.alignment",
                1,
                PACK_RESOURCE_LIMITS[resource],
            )
            if resource == "obj_tiles" and int(asset.get("sprite_bpp", 4)) == 8:
                alignment = max(2, alignment)
            requested_start = resource_placement.get("start")
            if requested_start is not None:
                start = require_int(requested_start, f"{resource}.start", 0, PACK_RESOURCE_LIMITS[resource])
                ok = pack_reserve_same(allocation_pools, start, count)
            else:
                start = pack_reserve_next_same(allocation_pools, count, alignment)
                ok = start is not None
            if ok:
                asset_allocations[resource] = { "start": start, "count": count, "end": start + count }
                if resource == "obj_palette_colors" and obj_palette_key[1] is not None:
                    shared_obj_palettes[obj_palette_key] = {
                        "asset": asset_id,
                        "start": start,
                    }
                if resource == "bg_palette_colors" and bg_palette_key[1] is not None:
                    shared_bg_palettes[bg_palette_key] = {
                        "asset": asset_id,
                        "start": start,
                    }
            else:
                largest_free_block = pack_largest_free_block(pool)
                free_block_count = pack_fragment_count(pool)
                overflow_reason = "count_exceeds_capacity" if count > len(pool) else "no_contiguous_block"
                if requested_start is not None:
                    overflow_reason = "fixed_range_unavailable"
                message = f"{name}: overflow em {resource} ({count} unidades)"
                diagnostic = pack_diagnostic(
                    "warning" if optional else "error",
                    "GBS_ASSET_PACK_OPTIONAL_RESOURCE_OMITTED" if optional else "GBS_ASSET_PACK_RESOURCE_OVERFLOW",
                    message,
                    resource=resource,
                    asset=name,
                    used=count,
                    capacity=PACK_RESOURCE_LIMITS[resource],
                    requested=count,
                    largest_free_block=largest_free_block,
                    free_block_count=free_block_count,
                    overflow_reason=overflow_reason,
                    allocation_mode="fixed" if requested_start is not None else "automatic",
                    group=bank_group,
                    room=room,
                    template=template,
                )
                if optional:
                    omitted = True
                    fallback_applied = True
                    diagnostic["fallback"] = "omit_optional_asset"
                else:
                    asset_errors.append(message)
                    errors.append(message)
                asset_diagnostics.append(diagnostic)
                diagnostics.append(diagnostic)

        if omitted:
            for pool_set, snapshot_set in zip(asset_pool_sets, asset_pool_snapshots):
                for resource, snapshot in snapshot_set.items():
                    pool_set[resource][:] = snapshot
            asset_allocations = {}

        status = pack_status_for_asset(asset_id, fingerprint["crc32"], previous_assets)
        change_reason = pack_change_reason_for_asset(asset_id, fingerprint["crc32"], resources, fingerprint["source"], previous_assets)
        previous_asset = previous_assets.get(asset_id)
        if (
            status == "unchanged"
            and isinstance(previous_asset, dict)
            and previous_asset.get("allocations") != asset_allocations
        ):
            status = "changed"
            change_reason = "allocation_changed"
        allocation = {
            "name": name,
            "id": asset_id,
            "bank_group": bank_group,
            "bank_groups": bank_groups,
            "room": room,
            "template": template,
            "kind": asset.get("kind", "bg"),
            "fingerprint": fingerprint["crc32"],
            "status": status,
            "change_reason": change_reason,
            "source": fingerprint["source"],
            "resource_config_fingerprint": resource_config_fingerprint,
            "resource_cache": resource_cache,
            "palette_cache": palette_cache,
            "resources": resources,
            "allocations": asset_allocations,
            "optional": optional,
            "omitted": omitted,
            "ok": not asset_errors,
            "errors": asset_errors,
            "diagnostics": asset_diagnostics,
            **({"object_palette_plan": obj_plan} if obj_plan is not None else {}),
        }
        allocations.append(allocation)
        allocation_by_asset_id[asset_id] = allocation

    report_pools = {resource: list(pool) for resource, pool in pools.items()}
    for pool_set in group_pools.values():
        for resource, pool in pool_set.items():
            report_pools[resource] = [
                used or group_used
                for used, group_used in zip(report_pools[resource], pool)
            ]

    usage = {}
    for resource, pool in report_pools.items():
        used = sum(1 for value in pool if value)
        capacity = len(pool)
        usage[resource] = {
            "used": used,
            "capacity": capacity,
            "remaining": capacity - used,
        }
    diagnostics.extend(pack_budget_diagnostics(usage))

    incremental = pack_incremental_summary(allocations, previous_assets)

    export_plan = pack_export_plan(assets, allocations, incremental, base_dir, previous_report)
    resource_bank_plan = pack_resource_bank_plan(allocations)
    fragmentation_report = pack_fragmentation_report(report_pools)
    overflow_report = [diagnostic for diagnostic in diagnostics if diagnostic.get("code") in ("GBS_ASSET_PACK_RESOURCE_OVERFLOW", "GBS_ASSET_PACK_OPTIONAL_RESOURCE_OMITTED")]
    room_pressure_report = pack_pressure_report_by_key(allocations, "room")
    template_pressure_report = pack_pressure_report_by_key(allocations, "template")
    group_pressure_report = pack_group_pressure_report(resource_bank_plan)
    resident_sets = pack_resident_sets(pack_data, allocations)
    resident_pressure_report = pack_resident_pressure_report(resident_sets, group_pressure_report)
    split_recommendations = pack_split_recommendations(allocations, room_pressure_report, group_pressure_report)
    compression_candidates = pack_compression_candidates(allocations)
    required_asset_summary = pack_required_asset_summary(allocations)
    optional_asset_summary = pack_optional_asset_summary(allocations)
    pool_reports = pack_pool_reports(report_pools)
    production_profile = pack_production_profile(
        pack_data,
        allocations,
        pool_reports,
        room_pressure_report,
        template_pressure_report,
        group_pressure_report,
        resident_sets,
        resident_pressure_report,
        overflow_report,
        split_recommendations,
        compression_candidates,
    )

    report = {
        "schema": 11,
        "kind": "GBAStudioAssetPackReport",
        "ok": not errors,
        "stress_profile": pack_data.get("stress_profile", "default"),
        "asset_count": len(allocations),
        "budgets": PACK_RESOURCE_LIMITS,
        "usage": usage,
        "budget_summary": pack_budget_summary(usage),
        "production_summary": pack_production_summary(allocations, errors, overflow_report, split_recommendations, compression_candidates),
        "production_profile": production_profile,
        "required_asset_summary": required_asset_summary,
        "optional_asset_summary": optional_asset_summary,
        "asset_reports": pack_asset_reports(allocations),
        "pool_reports": pool_reports,
        "banks": pack_resource_bank_summary(pools),
        "resource_bank_plan": resource_bank_plan,
        "resource_bank_groups": pack_resource_bank_groups(resource_bank_plan),
        "bank_usage_by_group": pack_bank_usage_by_group(resource_bank_plan),
        "group_pressure_report": group_pressure_report,
        "catalog_pressure_report": pack_catalog_pressure_report(room_pressure_report),
        "resident_sets": resident_sets,
        "resident_pressure_report": resident_pressure_report,
        "room_pressure_report": room_pressure_report,
        "template_pressure_report": template_pressure_report,
        "fragmentation_report": fragmentation_report,
        "overflow_report": overflow_report,
        "split_recommendations": split_recommendations,
        "compression_candidates": compression_candidates,
        "fallback_applied": fallback_applied,
        "incremental": incremental,
        "rebuild_plan": pack_rebuild_plan(incremental),
        "export_plan": export_plan,
        "allocations": allocations,
        "diagnostics": diagnostics,
        "errors": errors,
    }
    if physical_budget is not None:
        report["physical_budget"] = physical_budget
    return report

def resolve_project_path(base_dir, value, description):
    if not isinstance(value, str) or not value:
        raise SystemExit(f"{description} precisa ser string nao vazia")
    path = Path(value)
    if not path.is_absolute():
        path = base_dir / path
    return path


def emit_asset_header_from_pack_entry(asset, base_dir, symbol, allocation=None):
    asset = pack_asset_with_allocations(asset, allocation or {})
    if "audio_json" in asset:
        audio_path = resolve_project_path(base_dir, asset["audio_json"], "asset.audio_json")
        audio_data = json.loads(audio_path.read_text(encoding="utf-8"))
        return emit_audio_header(symbol, audio_data, audio_path.parent)

    if asset.get("kind") == "palette":
        palette_values = inline_palette_values(asset)
        palette_values.extend([0] * (16 - len(palette_values)))
        palette_start = int(asset.get("palette_bank", 0)) * 16
        selected = resolve_pack_compression_policy(
            asset.get("compression_policy"),
            "palette",
            palette_values=palette_values,
        ) if asset.get("compression_policy") is not None else None
        if selected is not None:
            asset["lz77_palette"] = selected["palette"] == "lz77"
            asset["huffman_palette"] = selected["palette"] == "huffman"
            selected_compression = selected["palette"]
        else:
            selected_compression = single_compression_flag(
                ("lz77", asset.get("lz77_palette", False)),
                ("huffman", asset.get("huffman_palette", False)),
            )
        lines = [
            "#pragma once",
            "#include <stdint.h>",
            '#include "gbs/assets.hpp"',
            *(['#include "gbs/compression.hpp"'] if selected_compression != "none" else []),
            "",
            f"constexpr uint16_t {symbol}_palette[16] = {{ {', '.join(hex(value) for value in palette_values)} }};",
        ]
        if asset.get("lz77_palette"):
            lines.extend(build_lz77_palette_lines(symbol, palette_values, palette_start))
        if asset.get("huffman_palette"):
            lines.extend(build_huffman_palette_lines(symbol, palette_values, palette_start))
        if selected_compression == "lz77":
            fields = primary_asset_compression_fields(
                selected_compression,
                f"{symbol}_lz77_palette_data",
                f"{symbol}_lz77_palette_size",
                len(palette_values) * 2,
            )
        elif selected_compression == "huffman":
            fields = primary_asset_compression_fields(
                selected_compression,
                f"{symbol}_huffman_palette_data",
                f"{symbol}_huffman_palette_size",
                huffman_palette_decoded_count(len(palette_values)),
            )
        else:
            fields = ""
        lines.extend([
            "",
            f"constexpr gbs::PaletteAsset {symbol}_palette_asset = {{ {symbol}_palette, 16, {palette_start}{fields} }};",
        ])
        return "\n".join(lines)

    if "png" not in asset:
        raise SystemExit(f"{asset.get('name', 'asset')}: export de projeto requer png ou audio_json para gerar header")

    image_path = resolve_project_path(base_dir, asset["png"], "asset.png")
    kind = asset.get("kind", "bg")
    sprite_width = asset.get("sprite_width")
    sprite_height = asset.get("sprite_height")
    sprite_bpp = require_int(asset.get("sprite_bpp", 4), "sprite_bpp", 4, 8)
    bitmap_mode = None
    if kind in ("bitmap3", "bitmap4", "bitmap5"):
        bitmap_mode = int(kind[-1])

    max_colors = 16
    if bitmap_mode == 4 or kind in ("affine_bg", "indexed_bg", "paged_bg", "bg"):
        max_colors = 256
    elif kind == "obj" or sprite_width is not None or sprite_height is not None:
        max_colors = None if sprite_bpp == 8 else 16
    elif bitmap_mode in (3, 5):
        max_colors = 240 * 160
    if kind == "paged_bg":
        max_colors = 224
    width, height, colors, indices, transparent_index = read_png(
        image_path,
        max_colors=max_colors,
        include_transparency=True,
    )

    if bitmap_mode is not None:
        return emit_bitmap_header(
            symbol,
            width,
            height,
            colors,
            indices,
            bitmap_mode,
            int(asset.get("palette_bank", 0)),
            bool(asset.get("lz77_palette", False)),
            bool(asset.get("huffman_palette", False)),
            asset.get("compression_policy"),
        )
    if kind == "affine_bg":
        return emit_affine_header(
            symbol,
            width,
            height,
            colors,
            indices,
            int(asset.get("destination_tile", 0)),
            bool(asset.get("lz77_palette", False)),
            pack_affine_tile_budget(asset),
            bool(asset.get("huffman_palette", False)),
            asset.get("compression_policy"),
        )
    if kind in ("indexed_bg", "paged_bg"):
        if int(asset.get("background_bpp", 8)) != 8:
            raise SystemExit(f"{asset.get('name', 'asset')}: indexed_bg exige background_bpp 8")
        return emit_indexed_background_header(symbol, width, height, colors, indices,
            max_source_tiles=65535 if kind == "paged_bg" else 1024)
    if kind == "obj" or sprite_width is not None or sprite_height is not None:
        if sprite_width is None or sprite_height is None:
            raise SystemExit(f"{asset.get('name', 'asset')}: sprite export requer sprite_width e sprite_height")
        colors, indices = prepare_obj_asset_pixels(
            colors,
            indices,
            transparent_index,
            asset,
        )
        return emit_sprite_header(
            symbol,
            width,
            height,
            colors,
            indices,
            int(asset.get("destination_tile", 0)),
            int(asset.get("palette_bank", 0)),
            int(sprite_width),
            int(sprite_height),
            int(asset.get("frame_duration", 8)),
            bool(asset.get("lz77_palette", False)),
            bool(asset.get("stream_frames", False)),
            sprite_bpp,
            bool(asset.get("huffman_palette", False)),
            asset.get("compression_policy"),
            len(asset["object_palette_plan"]["values"]) if "object_palette_plan" in asset else None,
        )

    tile_budget = pack_background_tile_budget(asset)
    tile_optimization = {} if tile_budget is not None else None
    reference_plan = background_palette_reference_plan(asset, base_dir)
    return emit_header(
        symbol,
        width,
        height,
        colors,
        indices,
        int(asset.get("destination_tile", 0)),
        int(asset.get("palette_bank", 0)),
        bool(asset.get("object_tiles", False)),
        bool(asset.get("rle_tilemap", False)),
        bool(asset.get("lz77_tilemap", False)),
        bool(asset.get("lz77_tiles", False)),
        bool(asset.get("lz77_palette", False)),
        asset.get("collision_color_index"),
        parse_slope_color_indexes(asset.get("slope_color_indexes")),
        int(asset.get("background_bpp", 4)),
        transparent_index,
        tile_budget,
        tile_optimization,
        pack_background_palette_banks(asset),
        reference_plan,
        bool(asset.get("huffman_tilemap", False)),
        bool(asset.get("huffman_tiles", False)),
        bool(asset.get("huffman_palette", False)),
        asset.get("compression_policy"),
    )


def write_text_if_changed(destination, text, encoding="utf-8"):
    content = text.encode(encoding)
    if not destination.exists() or destination.read_bytes() != content:
        destination.write_bytes(content)


def copy_project_template_files(template_dir, output_dir):
    if not template_dir.exists() or not template_dir.is_dir():
        raise SystemExit(f"template_dir nao encontrado: {template_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)
    for source in template_dir.iterdir():
        if source.is_file():
            destination = output_dir / source.name
            if not destination.exists() or destination.read_bytes() != source.read_bytes():
                shutil.copy2(source, destination)


def normalize_runtime_profile(value, description="kind"):
    if isinstance(value, dict):
        value = value.get("kind", value.get("profile"))
    if not isinstance(value, str) or not value:
        raise SystemExit(f"{description} precisa ser string nao vazia")
    normalized = RUNTIME_PROFILE_ALIASES.get(value)
    if normalized is None:
        supported = ", ".join(sorted(EXPORT_PROJECT_BLOCKS.keys()))
        raise SystemExit(f"{description} nao suportado: {value}. Suportados: {supported}")
    return normalized


def resolve_export_project_contract(project_data):
    runtime_profile_value = project_data.get("runtime_profile", project_data.get("kind", "topdown"))
    profile = normalize_runtime_profile(runtime_profile_value, "runtime_profile")
    kind = normalize_runtime_profile(project_data.get("kind", profile), "kind")
    if kind != profile and profile not in ("topdown", "platformer", "isometric"):
        raise SystemExit("kind e runtime_profile precisam apontar para o mesmo genero quando runtime_profile for especializado")

    block_name, base_runtime, adapter = EXPORT_PROJECT_BLOCKS[profile]
    project = project_data.get(block_name)
    source_block = block_name
    if project is None and adapter != "native":
        fallback_block = EXPORT_PROJECT_BLOCKS[base_runtime][0]
        project = project_data.get(fallback_block)
        source_block = fallback_block

    return {
        "profile": profile,
        "kind": profile,
        "base_runtime": base_runtime,
        "adapter": adapter,
        "block": source_block,
        "project": project,
    }


def cpp_string_literal(value):
    escaped = []
    for byte in str(value).encode("utf-8"):
        char = chr(byte)
        if char == "\\":
            escaped.append("\\\\")
        elif char == '"':
            escaped.append('\\"')
        elif char == "\n":
            escaped.append("\\n")
        elif char == "\r":
            escaped.append("\\r")
        elif char == "\t":
            escaped.append("\\t")
        elif byte < 32 or byte > 126:
            escaped.append(f"\\{byte:03o}")
        else:
            escaped.append(char)
    return '"' + "".join(escaped) + '"'


def cpp_optional_string_literal(value):
    if value is None or str(value).strip() == "":
        return "nullptr"
    return cpp_string_literal(value)


def normalize_dialogue_font_text(text):
    text = unicodedata.normalize("NFC", text).replace("…", "...").replace("\r\n", "\n").replace("\r", "\n")
    aliases = DIALOGUE_FONT_CONTRACT["aliases"]
    return "".join(aliases.get(character, character) for character in text)


def dialogue_line_entries_from_json(value, description):
    if value is None:
        value = []
    if not isinstance(value, list):
        raise SystemExit(f"{description} precisa ser lista")
    entries = []
    for index, item in enumerate(value):
        item_description = f"{description}[{index}]"
        if isinstance(item, str):
            entries.append({
                "text": normalize_dialogue_font_text(item),
                "speaker": "",
                "portrait": "",
                "emote": "",
                "key": "",
                "text_sound": "",
                "confirm_sound": "",
                "confirm_sfx": -1,
                "confirm_pcm": -1,
                "source_locale": "",
                "default_locale": "",
                "translations": [],
                "portrait_slot": "",
            })
            continue
        if not isinstance(item, dict):
            raise SystemExit(f"{item_description} precisa ser string ou objeto")
        text = item.get("text", item.get("line", ""))
        if not isinstance(text, str):
            raise SystemExit(f"{item_description}.text precisa ser string")
        speaker = item.get("speaker", item.get("character", ""))
        portrait = item.get("portrait", "")
        emote = item.get("emote", "")
        key = item.get("key", item.get("id", ""))
        text_sound = item.get("text_sound", item.get("textSound", ""))
        confirm_sound = item.get("confirm_sound", item.get("confirmSound", ""))
        confirm_sfx = item.get("confirm_sfx", item.get("confirmSfx", -1))
        confirm_pcm = item.get("confirm_pcm", item.get("confirmPcm", -1))
        source_locale = item.get("source_locale", item.get("sourceLocale", ""))
        default_locale = item.get("default_locale", item.get("defaultLocale", ""))
        portrait_slot = item.get("portrait_slot", item.get("portraitSlot", ""))
        raw_translations = item.get("translations", [])
        if not isinstance(speaker, str):
            raise SystemExit(f"{item_description}.speaker precisa ser string")
        if not isinstance(portrait, str):
            raise SystemExit(f"{item_description}.portrait precisa ser string")
        if not isinstance(emote, str):
            raise SystemExit(f"{item_description}.emote precisa ser string")
        if not isinstance(key, str):
            raise SystemExit(f"{item_description}.key precisa ser string")
        if not isinstance(text_sound, str):
            raise SystemExit(f"{item_description}.text_sound precisa ser string")
        if not isinstance(confirm_sound, str):
            raise SystemExit(f"{item_description}.confirm_sound precisa ser string")
        if not isinstance(confirm_sfx, int) or isinstance(confirm_sfx, bool):
            raise SystemExit(f"{item_description}.confirm_sfx precisa ser int")
        if not isinstance(confirm_pcm, int) or isinstance(confirm_pcm, bool):
            raise SystemExit(f"{item_description}.confirm_pcm precisa ser int")
        if not isinstance(source_locale, str):
            raise SystemExit(f"{item_description}.source_locale precisa ser string")
        if not isinstance(default_locale, str):
            raise SystemExit(f"{item_description}.default_locale precisa ser string")
        if not isinstance(portrait_slot, str):
            raise SystemExit(f"{item_description}.portrait_slot precisa ser string")
        normalized_portrait_slot = portrait_slot.strip().lower()
        if normalized_portrait_slot in ("esquerda", "left"):
            portrait_slot = "left"
        elif normalized_portrait_slot in ("direita", "right"):
            portrait_slot = "right"
        elif normalized_portrait_slot:
            raise SystemExit(f"{item_description}.portrait_slot precisa ser left/right")
        else:
            portrait_slot = ""
        if not isinstance(raw_translations, list):
            raise SystemExit(f"{item_description}.translations precisa ser lista")
        translations = []
        for translation_index, translation in enumerate(raw_translations):
            translation_description = f"{item_description}.translations[{translation_index}]"
            if not isinstance(translation, dict):
                raise SystemExit(f"{translation_description} precisa ser objeto")
            locale = translation.get("locale", "")
            translation_text = translation.get("text", "")
            if not isinstance(locale, str) or not locale.strip():
                raise SystemExit(f"{translation_description}.locale precisa ser string nao vazia")
            if not isinstance(translation_text, str):
                raise SystemExit(f"{translation_description}.text precisa ser string")
            translations.append({"locale": locale, "text": normalize_dialogue_font_text(translation_text)})
        entries.append({
            "text": normalize_dialogue_font_text(text),
            "speaker": normalize_dialogue_font_text(speaker),
            "portrait": portrait,
            "emote": emote,
            "key": key,
            "text_sound": text_sound,
            "confirm_sound": confirm_sound,
            "confirm_sfx": confirm_sfx,
            "confirm_pcm": confirm_pcm,
            "source_locale": source_locale,
            "default_locale": default_locale,
            "translations": translations,
            "portrait_slot": portrait_slot,
        })
    return entries


def dialogue_portrait_assets_from_json(value, description, asset_report):
    if value is None:
        return []
    if not isinstance(value, list):
        raise SystemExit(f"{description} precisa ser lista")
    entries = []
    for index, item in enumerate(value):
        item_description = f"{description}[{index}]"
        if not isinstance(item, dict):
            raise SystemExit(f"{item_description} precisa ser objeto")
        name = item.get("name", "")
        if not isinstance(name, str) or not name.strip():
            raise SystemExit(f"{item_description}.name precisa ser string nao vazia")
        metasprite = resolve_project_metasprite_symbol(
            item.get("metasprite"),
            None,
            asset_report,
            f"{item_description}.metasprite",
        )
        if metasprite is None:
            raise SystemExit(f"{item_description}.metasprite precisa referenciar asset valido")
        entries.append({
            "name": name,
            "metasprite": metasprite,
        })
    return entries


def emit_dialogue_emote_assets(output, emote_assets):
    if not emote_assets:
        output.extend([
            "constexpr const gbs::DialogueEmoteEntry* dialogue_emote_assets = nullptr;",
            "constexpr size_t dialogue_emote_asset_count = 0;",
            "",
        ])
        return
    output.append("constexpr gbs::DialogueEmoteEntry dialogue_emote_assets[] = {")
    for entry in emote_assets:
        output.append(
            f"    {{ {cpp_string_literal(entry['name'])}, &{entry['metasprite']} }},"
        )
    output.append("};")
    output.append(f"constexpr size_t dialogue_emote_asset_count = {len(emote_assets)};")
    output.append("")


def emit_shmup_actor_sprites(output, actor_sprites):
    if not actor_sprites:
        output.extend([
            "constexpr const gbs::MetaSprite* const* shmup_actor_sprites = nullptr;",
            "constexpr size_t shmup_actor_sprite_count = 0;",
            "",
        ])
        return
    output.append("constexpr const gbs::MetaSprite* shmup_actor_sprites[] = {")
    for entry in actor_sprites:
        output.append(f"    &{entry['metasprite']},")
    output.extend([
        "};",
        f"constexpr size_t shmup_actor_sprite_count = {len(actor_sprites)};",
        "",
    ])


def dialogue_emote_assets_from_json(value, description, asset_report):
    if value is None:
        return []
    if not isinstance(value, list):
        raise SystemExit(f"{description} precisa ser lista")
    entries = []
    for index, item in enumerate(value):
        item_description = f"{description}[{index}]"
        if not isinstance(item, dict):
            raise SystemExit(f"{item_description} precisa ser objeto")
        name = item.get("name", "")
        if not isinstance(name, str) or not name.strip():
            raise SystemExit(f"{item_description}.name precisa ser string nao vazia")
        metasprite = resolve_project_metasprite_symbol(
            item.get("metasprite"),
            None,
            asset_report,
            f"{item_description}.metasprite",
        )
        if metasprite is None:
            raise SystemExit(f"{item_description}.metasprite precisa referenciar asset valido")
        entries.append({
            "name": name,
            "metasprite": metasprite,
        })
    return entries


def emit_dialogue_portrait_assets(output, portrait_assets):
    if not portrait_assets:
        output.extend([
            "constexpr const gbs::DialoguePortraitEntry* dialogue_portrait_assets = nullptr;",
            "constexpr size_t dialogue_portrait_asset_count = 0;",
            "",
        ])
        return
    output.append("constexpr gbs::DialoguePortraitEntry dialogue_portrait_assets[] = {")
    for entry in portrait_assets:
        output.append(
            f"    {{ {cpp_string_literal(entry['name'])}, &{entry['metasprite']} }},"
        )
    output.append("};")
    output.append(f"constexpr size_t dialogue_portrait_asset_count = {len(portrait_assets)};")
    output.append("")


def emit_dialogue_lines(output, raw_lines, description, symbol_name="dialogue_lines"):
    dialogue_lines = dialogue_line_entries_from_json(raw_lines, description)
    if not dialogue_lines:
        return "nullptr", 0
    translation_symbols = []
    for index, line in enumerate(dialogue_lines):
        translations = line["translations"]
        if not translations:
            translation_symbols.append(("nullptr", 0))
            continue
        translation_symbol = f"{symbol_name}_{index}_translations"
        output.append(f"constexpr gbs::DialogueTranslation {translation_symbol}[] = {{")
        for translation in translations:
            output.append(
                "    gbs::DialogueTranslation { "
                f"{cpp_string_literal(translation['locale'])}, "
                f"{cpp_string_literal(translation['text'])} "
                "},"
            )
        output.append("};")
        output.append("")
        translation_symbols.append((translation_symbol, len(translations)))
    output.append(f"constexpr gbs::DialogueLine {symbol_name}[] = {{")
    for index, line in enumerate(dialogue_lines):
        translation_symbol, translation_count = translation_symbols[index]
        output.append(
            "    gbs::DialogueLine { "
            f"{cpp_string_literal(line['text'])}, "
            f"{cpp_optional_string_literal(line['speaker'])}, "
            f"{cpp_optional_string_literal(line['portrait'])}, "
            f"{cpp_optional_string_literal(line['emote'])}, "
            f"{cpp_optional_string_literal(line['key'])}, "
            f"{cpp_optional_string_literal(line['text_sound'])}, "
            f"{cpp_optional_string_literal(line['confirm_sound'])}, "
            f"{int(line['confirm_sfx'])}, "
            f"{int(line['confirm_pcm'])}, "
            f"{cpp_optional_string_literal(line['source_locale'])}, "
            f"{cpp_optional_string_literal(line['default_locale'])}, "
            f"{translation_symbol}, "
            f"{translation_count}, "
            f"{cpp_optional_string_literal(line['portrait_slot'])} "
            "},"
        )
    output.append("};")
    output.append("")
    return symbol_name, len(dialogue_lines)


def int_list_from_json(value, expected_count, description, minimum=0, maximum=255):
    if not isinstance(value, list) or len(value) != expected_count:
        raise SystemExit(f"{description} precisa ter {expected_count} itens")
    result = []
    for index, item in enumerate(value):
        if not isinstance(item, int) or item < minimum or item > maximum:
            raise SystemExit(f"{description}[{index}] precisa ser inteiro entre {minimum} e {maximum}")
        result.append(item)
    return result


def has_valid_streaming_room_dimensions(width, height):
    return width > 0 and height > 0 and width * height <= 0x7FFFFFFF


def rect_from_json(value, description):
    if not isinstance(value, dict):
        raise SystemExit(f"{description} precisa ser objeto")
    return (
        int(value.get("x", 0)),
        int(value.get("y", 0)),
        int(value.get("width", 0)),
        int(value.get("height", 0)),
    )


def vec2_from_json(value, description):
    if not isinstance(value, dict):
        raise SystemExit(f"{description} precisa ser objeto")
    return (int(value.get("x", 0)), int(value.get("y", 0)))


def format_cpp_u8_array(name, values):
    lines = [f"constexpr uint8_t {name}[] = {{"]
    for start in range(0, len(values), 16):
        chunk = values[start:start + 16]
        suffix = "," if start + 16 < len(values) else ""
        lines.append("    " + ", ".join(str(value) for value in chunk) + suffix)
    lines.append("};")
    return "\n".join(lines)


def format_cpp_u16_array(name, values):
    lines = [f"constexpr uint16_t {name}[] = {{"]
    for start in range(0, len(values), 12):
        chunk = values[start:start + 12]
        suffix = "," if start + 12 < len(values) else ""
        lines.append("    " + ", ".join(str(value) for value in chunk) + suffix)
    lines.append("};")
    return "\n".join(lines)


def string_list_from_json(value, description):
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(item, str) and item for item in value):
        raise SystemExit(f"{description} precisa ser lista de strings")
    return value


def asset_pack_header_map(asset_report):
    if asset_report is None:
        return {}
    export_plan = asset_report.get("export_plan", {})
    headers = export_plan.get("headers", [])
    if not isinstance(headers, list):
        return {}
    result = {}
    for header in headers:
        if not isinstance(header, dict):
            continue
        asset_id = header.get("id")
        header_name = header.get("header")
        if isinstance(asset_id, str) and asset_id and isinstance(header_name, str) and header_name:
            result[asset_id] = header_name
    return result


def asset_pack_member_symbol(asset_report, asset_id, member, index=None):
    symbols = asset_pack_symbol_map(asset_report)
    base_symbol = symbols.get(asset_id)
    if base_symbol is None:
        return None
    suffixes = {
        "bg_palettes": "palette_asset",
        "obj_palettes": "palette_asset",
        "palette_asset": "palette_asset",
        "tile_asset": "tile_asset",
        "bitmap_asset": "bitmap_asset",
        "affine_tile_asset": "tile_asset",
        "affine_tilemap_asset": "tilemap_asset",
        "tile_assets": "tile_asset",
        "tilemap": "tilemap_asset",
        "rle_tilemap": "tilemap_rle_asset",
        "lz77_tilemap": "tilemap_lz77_asset",
        "lz77_tiles": "lz77_tile_asset",
        "lz77_palette": "lz77_palette_asset",
        "huffman_tilemap": "tilemap_huffman_asset",
        "huffman_tiles": "huffman_tile_asset",
        "huffman_palette": "huffman_palette_asset",
    }
    suffix = suffixes.get(member)
    if suffix is not None:
        return f"{base_symbol}_{suffix}"

    if member in ("metasprite", "metasprites"):
        asset_index = 0 if index is None else index
        return f"{base_symbol}_metasprites[{asset_index}]"
    if member in ("animation", "sprite_animation"):
        return f"{base_symbol}_animation"

    audio_arrays = {
        "sfx_assets": "sfx_assets",
        "music_assets": "music_assets",
        "pcm_assets": "pcm_assets",
        "tracker_assets": "tracker_assets",
    }
    array_suffix = audio_arrays.get(member)
    if array_suffix is not None:
        asset_index = 0 if index is None else index
        return f"{base_symbol}_{array_suffix}[{asset_index}]"
    return None


def project_asset_reference_items(project, assets, key, description):
    value = assets.get(key, project.get(key, []))
    if value is None:
        return []
    if not isinstance(value, list):
        raise SystemExit(f"{description}.assets.{key} precisa ser lista")
    for index, item in enumerate(value):
        if isinstance(item, str) and item:
            continue
        if isinstance(item, dict):
            asset_id = item.get("asset")
            symbol = item.get("symbol")
            if isinstance(asset_id, str) and asset_id:
                continue
            if isinstance(symbol, str) and symbol:
                continue
        raise SystemExit(f"{description}.assets.{key}[{index}] precisa ser string ou objeto com asset/symbol")
    return value


def resolve_project_asset_symbol(item, key, asset_report, item_description):
    if isinstance(item, dict):
        symbol = item.get("symbol")
        if isinstance(symbol, str) and symbol:
            return symbol
        asset_id = item.get("asset")
        index_value = item.get("index", None)
        index = None
        if index_value is not None:
            index = require_int(index_value, f"{item_description}.index", 0, 255)
        symbol = asset_pack_member_symbol(asset_report, asset_id, key, index) if isinstance(asset_id, str) else None
        if symbol is None:
            raise SystemExit(f"{item_description}.asset desconhecido ou incompativel: {asset_id}")
        return symbol

    symbol = asset_pack_member_symbol(asset_report, item, key)
    return symbol if symbol is not None else item


def resolve_menu_actor_asset_symbol(value, key, asset_report):
    """Resolve an actor's owning OBJ resource without guessing from a raw C++ symbol."""
    if isinstance(value, dict):
        asset_id = value.get("asset")
        if isinstance(asset_id, str) and asset_id:
            return asset_pack_member_symbol(asset_report, asset_id, key)
        return None
    if isinstance(value, str) and value:
        return asset_pack_member_symbol(asset_report, value, key)
    return None


def asset_pack_header_for_id(asset_report, asset_id):
    if asset_report is None or not isinstance(asset_id, str) or not asset_id:
        return None
    export_plan = asset_report.get("export_plan", {})
    headers = export_plan.get("headers", [])
    if not isinstance(headers, list):
        return None
    for header in headers:
        if isinstance(header, dict) and header.get("id") == asset_id:
            return header
    return None


def assetc_arg_int(args, flag, default):
    if not isinstance(args, list):
        return default
    for index, item in enumerate(args):
        if item == flag and index + 1 < len(args):
            try:
                return int(args[index + 1])
            except (TypeError, ValueError):
                return default
    return default


def tilemap_values_from_asset_pack_entry(asset_report, base_dir, asset_id, description):
    header = asset_pack_header_for_id(asset_report, asset_id)
    if header is None:
        raise SystemExit(f"{description} referencia asset desconhecido: {asset_id}")
    derived = header.get("derived", {})
    cached_tilemap_values = derived.get("tilemap_values") if isinstance(derived, dict) else None
    if (
        isinstance(cached_tilemap_values, list)
        and all(isinstance(value, int) and 0 <= value <= 0xFFFF for value in cached_tilemap_values)
    ):
        return list(cached_tilemap_values)
    inputs = header.get("inputs", [])
    if not isinstance(inputs, list) or not inputs:
        raise SystemExit(f"{description} referencia asset sem PNG fonte: {asset_id}")
    source = inputs[0]
    if not isinstance(source, str) or not source:
        raise SystemExit(f"{description} referencia PNG fonte invalido: {asset_id}")
    if base_dir is None:
        raise SystemExit(f"{description} precisa do diretorio base para remapear visual_tilemap")

    args = header.get("assetc_args", [])
    background_bpp = assetc_arg_int(args, "--background-bpp", 4)
    width, height, colors, indices = read_png(base_dir / source, max_colors=256)
    if background_bpp != 4:
        raise SystemExit("background_bpp suporta somente 4")
    _palette, _tiles, tilemap_entries, _tilemap_width, _tilemap_height = build_cached_4bpp_background(
        width, height, colors, indices
    )
    destination_tile = assetc_arg_int(args, "--destination-tile", 0)
    palette_bank = assetc_arg_int(args, "--palette-bank", 0)
    return [
        destination_tile + (entry & 0x0FFF) + ((palette_bank + (entry >> 12)) << 12)
        for entry in tilemap_entries
    ]


def source_asset_tilemap_for_dimensions(tilemap_values, asset_report, asset_id, target_width, target_height, description):
    target_count = target_width * target_height
    if len(tilemap_values) >= target_count:
        return tilemap_values[:target_count]

    header = asset_pack_header_for_id(asset_report, asset_id)
    resources = header.get("resources", {}) if isinstance(header, dict) else {}
    source_width = resources.get("tilemap_width") if isinstance(resources, dict) else None
    source_height = resources.get("tilemap_height") if isinstance(resources, dict) else None
    if (
        not isinstance(source_width, int)
        or not isinstance(source_height, int)
        or source_width <= 0
        or source_height <= 0
        or source_width * source_height != len(tilemap_values)
        or target_width < source_width
        or target_height < source_height
    ):
        raise SystemExit(
            f"{description} possui {len(tilemap_values)} entradas, "
            f"mas a cena exige {target_count}"
        )

    # A source_asset is authored at the viewport size. Wider rooms repeat whole
    # rows so the pattern remains stable instead of flattening the source buffer.
    return [
        tilemap_values[(y % source_height) * source_width + (x % source_width)]
        for y in range(target_height)
        for x in range(target_width)
    ]


def remap_topdown_visual_tiles_from_asset(room, visual, room_index, asset_report, base_dir):
    asset_id = room.get("visual_tilemap", room.get("visual_tilemap_asset"))
    if asset_id is None:
        return visual
    if isinstance(asset_id, dict):
        asset_id = asset_id.get("asset")
    if not isinstance(asset_id, str) or not asset_id:
        raise SystemExit(f"topdown_project.rooms[{room_index}].visual_tilemap precisa ser string ou objeto com asset")
    tilemap_values = tilemap_values_from_asset_pack_entry(
        asset_report,
        base_dir,
        asset_id,
        f"topdown_project.rooms[{room_index}].visual_tilemap",
    )
    if room.get("visual_tilemap_layout") == "source_asset":
        width = int(room.get("width_tiles", 0))
        height = int(room.get("height_tiles", 0))
        return source_asset_tilemap_for_dimensions(
            tilemap_values,
            asset_report,
            asset_id,
            width,
            height,
            f"topdown_project.rooms[{room_index}].visual_tilemap",
        )
    remapped = []
    for tile_index in visual:
        if tile_index < 0 or tile_index >= len(tilemap_values):
            raise SystemExit(
                f"topdown_project.rooms[{room_index}].visual_tiles referencia tile {tile_index}, "
                f"mas {asset_id} possui {len(tilemap_values)} entradas"
            )
        remapped.append(tilemap_values[tile_index])
    return remapped


def remap_platformer_visual_tiles_from_asset(room, visual, room_index, asset_report, base_dir):
    asset_id = room.get("visual_tilemap", room.get("visual_tilemap_asset"))
    if asset_id is None:
        return visual
    if isinstance(asset_id, dict):
        asset_id = asset_id.get("asset")
    if not isinstance(asset_id, str) or not asset_id:
        raise SystemExit(f"platformer_project.rooms[{room_index}].visual_tilemap precisa ser string ou objeto com asset")
    tilemap_values = tilemap_values_from_asset_pack_entry(
        asset_report,
        base_dir,
        asset_id,
        f"platformer_project.rooms[{room_index}].visual_tilemap",
    )
    if room.get("visual_tilemap_layout") == "source_asset":
        width = int(room.get("width_tiles", 0))
        height = int(room.get("height_tiles", 0))
        return source_asset_tilemap_for_dimensions(
            tilemap_values,
            asset_report,
            asset_id,
            width,
            height,
            f"platformer_project.rooms[{room_index}].visual_tilemap",
        )
    remapped = []
    for tile_index in visual:
        if tile_index < 0 or tile_index >= len(tilemap_values):
            raise SystemExit(
                f"platformer_project.rooms[{room_index}].visual_tiles referencia tile {tile_index}, "
                f"mas {asset_id} possui {len(tilemap_values)} entradas"
            )
        remapped.append(tilemap_values[tile_index])
    return remapped


def remap_platformer_layer_tiles_from_asset(layer, tiles, room_width, room_height, room_index, layer_index, asset_report, base_dir):
    asset_id = layer.get("tilemap")
    if asset_id is None:
        return tiles
    if isinstance(asset_id, dict):
        asset_id = asset_id.get("asset")
    description = f"platformer_project.rooms[{room_index}].background_layers[{layer_index}]"
    if not isinstance(asset_id, str) or not asset_id:
        raise SystemExit(f"{description}.tilemap precisa ser string ou objeto com asset")
    tilemap_values = tilemap_values_from_asset_pack_entry(
        asset_report,
        base_dir,
        asset_id,
        f"{description}.tilemap",
    )
    if layer.get("tilemap_layout") == "source_asset":
        return source_asset_tilemap_for_dimensions(
            tilemap_values,
            asset_report,
            asset_id,
            room_width,
            room_height,
            f"{description}.tilemap",
        )
    remapped = []
    for tile_index in tiles:
        if tile_index < 0 or tile_index >= len(tilemap_values):
            raise SystemExit(
                f"{description}.tiles referencia tile {tile_index}, "
                f"mas {asset_id} possui {len(tilemap_values)} entradas"
            )
        remapped.append(tilemap_values[tile_index])
    return remapped


def remap_topdown_foreground_tiles_from_asset(room, foreground, room_index, asset_report, base_dir):
    asset_id = room.get("visual_tilemap", room.get("visual_tilemap_asset"))
    if asset_id is None:
        return [0 if tile_index < 0 else tile_index for tile_index in foreground]
    if isinstance(asset_id, dict):
        asset_id = asset_id.get("asset")
    if not isinstance(asset_id, str) or not asset_id:
        raise SystemExit(f"topdown_project.rooms[{room_index}].visual_tilemap precisa ser string ou objeto com asset")
    tilemap_values = tilemap_values_from_asset_pack_entry(
        asset_report,
        base_dir,
        asset_id,
        f"topdown_project.rooms[{room_index}].visual_tilemap",
    )
    remapped = []
    for tile_index in foreground:
        if tile_index < 0:
            remapped.append(0)
            continue
        if tile_index >= len(tilemap_values):
            raise SystemExit(
                f"topdown_project.rooms[{room_index}].foreground_tiles referencia tile {tile_index}, "
                f"mas {asset_id} possui {len(tilemap_values)} entradas"
            )
        remapped.append(tilemap_values[tile_index])
    return remapped


def resolve_project_metasprite_symbol(value, fallback, asset_report, description):
    if value is None:
        return fallback
    if isinstance(value, dict):
        return resolve_project_asset_symbol(value, "metasprite", asset_report, description)
    if isinstance(value, str) and value:
        symbol = asset_pack_member_symbol(asset_report, value, "metasprite")
        return symbol if symbol is not None else value
    raise SystemExit(f"{description} precisa ser string ou objeto com asset/symbol")


def resolve_project_animation_symbol(value, asset_report, description):
    if value is None:
        return None
    if isinstance(value, dict):
        return resolve_project_asset_symbol(value, "animation", asset_report, description)
    if isinstance(value, str) and value:
        symbol = asset_pack_member_symbol(asset_report, value, "animation")
        return symbol if symbol is not None else value
    raise SystemExit(f"{description} precisa ser string ou objeto com asset/symbol")


def animation_lookup_key(value):
    return str(value).strip().lower().replace("-", "_")


def int_sequence_from_json(value, description, minimum=0, maximum=255):
    if not isinstance(value, list) or not value:
        raise SystemExit(f"{description} precisa ser lista nao vazia")
    result = []
    for index, item in enumerate(value):
        if not isinstance(item, int) or item < minimum or item > maximum:
            raise SystemExit(f"{description}[{index}] precisa ser inteiro entre {minimum} e {maximum}")
        result.append(item)
    return result


def resolve_project_metasprite_array_symbol(value, asset_report, description):
    if isinstance(value, dict):
        symbol = value.get("symbol")
        if isinstance(symbol, str) and symbol:
            return f"{symbol}_metasprites"
        asset_id = value.get("asset")
        base_symbol = asset_pack_symbol_map(asset_report).get(asset_id) if isinstance(asset_id, str) else None
        if base_symbol is not None:
            return f"{base_symbol}_metasprites"
    elif isinstance(value, str) and value:
        base_symbol = asset_pack_symbol_map(asset_report).get(value)
        return f"{base_symbol}_metasprites" if base_symbol is not None else f"{value}_metasprites"
    raise SystemExit(f"{description} precisa referenciar asset/symbol para frame_indices")


def emit_topdown_animation_frame_subset(output, prefix, name, entry, asset_report, description, base_dir=None):
    reference = entry.get("animation", entry.get("asset", entry.get("sprite_asset", entry.get("sprite"))))
    if reference is None:
        reference = entry
    elif isinstance(reference, str):
        reference = {"asset": reference}
    custom = emit_animation_custom_metasprites(output, prefix, name, entry, asset_report, base_dir, description)
    custom_symbol = custom[0] if custom is not None else None
    metasprites = custom_symbol if custom_symbol is not None else resolve_project_metasprite_array_symbol(reference, asset_report, description)
    frame_indices = int_sequence_from_json(
        entry.get("frame_indices", entry.get("frames")),
        f"{description}.frame_indices",
        0,
        255,
    )
    durations_value = entry.get("durations", entry.get("frame_durations"))
    if durations_value is None:
        durations = [10] * len(frame_indices)
    else:
        durations = int_sequence_from_json(durations_value, f"{description}.durations", 1, 255)
        if len(durations) != len(frame_indices):
            raise SystemExit(f"{description}.durations precisa ter o mesmo tamanho de frame_indices")
    loops = bool(entry.get("loops", entry.get("loop", True)))
    stream_symbol = custom[1] if custom is not None else None
    source_frames = custom[2] if custom is not None and stream_symbol is not None else None
    if custom is None and isinstance(reference, dict) and isinstance(reference.get("asset"), str):
        header = sprite_asset_pack_header(asset_report, reference["asset"])
        if header is not None and "--stream-frames" in header.get("assetc_args", []):
            stream_symbol = header.get("symbol", reference["asset"])
    symbol = f"{pack_safe_identifier(prefix)}_{pack_safe_identifier(name)}_animation"
    frames_symbol = f"{symbol}_frames"
    output.append(f"constexpr gbs::SpriteAnimationFrame {frames_symbol}[] = {{")
    for frame_index, duration in zip(frame_indices, durations):
        source_frame_index = source_frames[frame_index] if source_frames is not None else frame_index
        streamed_asset = (
            f", &{stream_symbol}_frame_{source_frame_index}_tile_asset"
            if stream_symbol is not None else ""
        )
        if custom_symbol is not None:
            output.append(f"    {{ {custom_symbol}[{frame_index}], {duration}{streamed_asset} }},")
        else:
            output.append(f"    {{ {metasprites}[{frame_index}], {duration}{streamed_asset} }},")
    output.append("};")
    output.append(f"constexpr gbs::SpriteAnimation {symbol} {{ {frames_symbol}, {len(frame_indices)}, {'true' if loops else 'false'} }};")
    output.append("")
    return symbol


def topdown_npc_animation_entries(output, prefix, npc, asset_report, description, base_dir=None):
    raw_entries = npc.get("animations", [])
    if raw_entries is None:
        raw_entries = []
    if raw_entries and not isinstance(raw_entries, list):
        raise SystemExit(f"{description}.animations precisa ser lista")

    entries = []
    for index, entry in enumerate(raw_entries):
        entry_description = f"{description}.animations[{index}]"
        if isinstance(entry, str):
            name = entry
            symbol = resolve_project_animation_symbol(entry, asset_report, entry_description)
        elif isinstance(entry, dict):
            name = entry.get("name", entry.get("id", f"animation_{index}"))
            if entry.get("frame_indices", entry.get("frames")) is not None:
                symbol = emit_topdown_animation_frame_subset(output, prefix, str(name), entry, asset_report, entry_description, base_dir)
            else:
                reference = entry.get("animation", entry.get("asset", entry.get("sprite_asset", entry.get("sprite"))))
                if reference is None:
                    reference = entry
                elif isinstance(reference, str):
                    reference = {"asset": reference}
                symbol = resolve_project_animation_symbol(reference, asset_report, entry_description)
        else:
            raise SystemExit(f"{entry_description} precisa ser string ou objeto")
        entries.append((str(name), symbol))
    return entries


def emit_topdown_npc_animation_table(output, prefix, npc, asset_report, description, base_dir=None):
    entries = topdown_npc_animation_entries(output, prefix, npc, asset_report, description, base_dir)
    animation_value = npc.get("animation", None)
    if not entries:
        symbol = resolve_project_animation_symbol(animation_value, asset_report, f"{description}.animation")
        return (f"&{symbol}" if symbol else "nullptr", "nullptr", 0, {})

    lookup = {}
    symbols = []
    for index, (name, symbol) in enumerate(entries):
        lookup[animation_lookup_key(name)] = index
        symbols.append(symbol)

    animation_name = f"{prefix}_animations"
    output.append(f"constexpr const gbs::SpriteAnimation* {animation_name}[] = {{")
    for symbol in symbols:
        output.append(f"    &{symbol},")
    output.append("};")
    output.append("")

    initial_index = 0
    if animation_value is not None:
        if isinstance(animation_value, str):
            initial_index = lookup.get(animation_lookup_key(animation_value), 0)
        else:
            initial_symbol = resolve_project_animation_symbol(animation_value, asset_report, f"{description}.animation")
            for index, symbol in enumerate(symbols):
                if symbol == initial_symbol:
                    initial_index = index
                    break

    return (f"{animation_name}[{initial_index}]", animation_name, len(symbols), lookup)


def project_actor_visual_ref(actor):
    for key in ("metasprite", "sprite", "sprite_asset", "asset"):
        value = actor.get(key)
        if value is not None:
            return value
    return None


def resolve_isometric_actor_visual_exprs(actor, asset_report, description):
    visual_ref = project_actor_visual_ref(actor)
    if visual_ref is None:
        return (
            f"static_cast<uint16_t>({int(actor.get('tile_index', 0))})",
            f"static_cast<uint16_t>({int(actor.get('palette', 0))})",
        )

    metasprite = resolve_project_metasprite_symbol(visual_ref, None, asset_report, f"{description}.metasprite")
    return (
        f"static_cast<uint16_t>({metasprite}.parts[0].tile_index)",
        f"static_cast<uint16_t>({metasprite}.parts[0].palette)",
    )


def emit_isometric_actor_animation_set(output, prefix, actor, asset_report, description, base_dir=None):
    raw_entries = actor.get("animations", [])
    if raw_entries is None:
        raw_entries = []
    if not isinstance(raw_entries, list):
        raise SystemExit(f"{description}.animations precisa ser lista")

    lookup = {}
    for index, entry in enumerate(raw_entries):
        entry_description = f"{description}.animations[{index}]"
        if not isinstance(entry, dict):
            raise SystemExit(f"{entry_description} precisa ser objeto")
        name = entry.get("name", entry.get("id"))
        if not isinstance(name, str) or not name:
            raise SystemExit(f"{entry_description}.name precisa ser string")
        symbol = emit_topdown_animation_frame_subset(
            output,
            prefix,
            name,
            entry,
            asset_report,
            entry_description,
            base_dir,
        )
        lookup[animation_lookup_key(name)] = symbol

    expected = (
        "idle_down", "idle_up", "idle_left", "idle_right",
        "walk_down", "walk_up", "walk_left", "walk_right",
        "move_down", "move_up", "move_left", "move_right",
        "attack_down", "attack_up", "attack_left", "attack_right",
        "hurt_down", "hurt_up", "hurt_left", "hurt_right",
        "defeat_down", "defeat_up", "defeat_left", "defeat_right",
    )
    set_symbol = f"{prefix}_animation_set"
    output.append(f"constexpr gbs::IsoActorAnimationSet {set_symbol} {{")
    for name in expected:
        symbol = lookup.get(animation_lookup_key(name))
        output.append(f"    {'&' + symbol if symbol else 'nullptr'},")
    output.append("};")
    output.append("")
    return set_symbol, lookup


ISOMETRIC_TACTICAL_CAPABILITY_BITS = {
    "tactical_surface": 1 << 0,
    "tactical_grid_overlay": 1 << 1,
    "tactical_hud": 1 << 2,
    "tactical_units": 1 << 3,
    "tactical_props": 1 << 4,
    "tactical_feedback": 1 << 5,
    "tactical_audio": 1 << 6,
}

ISOMETRIC_TACTICAL_AUDIO_CUES = (
    "cursor", "select", "cancel", "move", "attack", "hit", "turn", "victory", "defeat",
)

ISOMETRIC_TACTICAL_ANIMATION_BINDINGS = (
    "idle_down", "idle_up", "idle_left", "idle_right",
    "move_down", "move_up", "move_left", "move_right",
    "attack_down", "attack_up", "attack_left", "attack_right",
    "hurt_down", "hurt_up", "hurt_left", "hurt_right",
    "defeat_down", "defeat_up", "defeat_left", "defeat_right",
)

ISOMETRIC_ACTOR_ANIMATION_BINDINGS = (
    "idle_down", "idle_up", "idle_left", "idle_right",
    "walk_down", "walk_up", "walk_left", "walk_right",
    "move_down", "move_up", "move_left", "move_right",
    "attack_down", "attack_up", "attack_left", "attack_right",
    "hurt_down", "hurt_up", "hurt_left", "hurt_right",
    "defeat_down", "defeat_up", "defeat_left", "defeat_right",
)


def tactical_animation_symbol(
    unit,
    binding,
    actor_animation_lookup,
    asset_report,
    description,
):
    animations = unit.get("animations", {})
    value = animations.get(binding)
    if value is None and binding.startswith("walk_"):
        value = animations.get(binding.replace("walk_", "move_", 1))
    if value is None:
        raise SystemExit(f"{description}.animations.{binding} ausente")

    lookup_candidates = []
    if isinstance(value, str) and value:
        lookup_candidates.extend((value, value.removesuffix("_animation")))
    for candidate in lookup_candidates:
        symbol = actor_animation_lookup.get(animation_lookup_key(candidate))
        if symbol is not None:
            return f"&{symbol}"

    symbol = resolve_project_animation_symbol(
        value,
        asset_report,
        f"{description}.animations.{binding}",
    )
    if not symbol:
        raise SystemExit(f"{description}.animations.{binding} nao pode ser resolvida")
    return f"&{symbol}"


def emit_isometric_tactical_animation_set(
    output,
    prefix,
    unit_index,
    unit,
    actor_animation_lookup,
    asset_report,
    description,
):
    set_symbol = f"{prefix}_tactical_unit_{unit_index}_animation_set"
    output.append(f"constexpr gbs::IsoActorAnimationSet {set_symbol} {{")
    for binding in ISOMETRIC_ACTOR_ANIMATION_BINDINGS:
        output.append(
            "    " + tactical_animation_symbol(
                unit,
                binding,
                actor_animation_lookup,
                asset_report,
                description,
            ) + ","
        )
    output.append("};")
    output.append("")
    return set_symbol


def tactical_asset_pointer(value, member, asset_report, description):
    if value is None:
        return "nullptr"
    symbol = resolve_project_asset_symbol(value, member, asset_report, description)
    if not isinstance(symbol, str) or not symbol:
        raise SystemExit(f"{description} nao pode ser resolvido para um simbolo nativo")
    return f"&{symbol}"


def tactical_metasprite_pointer(value, index, asset_report, description):
    if value is None:
        return "nullptr"
    if isinstance(value, dict) and isinstance(value.get("symbol"), str) and value.get("symbol"):
        symbol = value["symbol"]
    else:
        reference = value
        if isinstance(value, str):
            reference = {"asset": value, "index": index}
        elif isinstance(value, dict) and "index" not in value:
            reference = {**value, "index": index}
        symbol = resolve_project_metasprite_symbol(reference, None, asset_report, description)
    if not isinstance(symbol, str) or not symbol:
        raise SystemExit(f"{description} nao pode ser resolvido para um metasprite nativo")
    return f"&{symbol}"


def tactical_marker_index(presentation, key, default, description):
    indices = presentation.get("indices", {})
    markers = indices.get("markers", {}) if isinstance(indices, dict) else {}
    value = markers.get(key, default) if isinstance(markers, dict) else default
    return require_int(value, f"{description}.indices.markers.{key}", 0, 255)


def tactical_actor_index(unit, actors, unit_index, description):
    actor_id = unit.get("actor_id", unit.get("actorId")) if isinstance(unit, dict) else None
    if isinstance(actor_id, str) and actor_id:
        for actor_index, actor in enumerate(actors):
            if not isinstance(actor, dict):
                continue
            candidates = (actor.get("id"), actor.get("name"), actor.get("actor_id"), actor.get("actorId"))
            if actor_id in candidates:
                return actor_index
        if actor_id.isdigit():
            numeric_index = int(actor_id)
            if 0 <= numeric_index < len(actors):
                return numeric_index
    if unit_index < len(actors):
        return unit_index
    raise SystemExit(f"{description}.actor_id nao referencia um ator emitido")


def tactical_audio_cue_index(presentation, cue, default, description):
    audio = presentation.get("audio", {})
    cue_indices = audio.get("cue_indices", {}) if isinstance(audio, dict) else {}
    if not isinstance(cue_indices, dict):
        cue_indices = {}
    if cue not in cue_indices:
        indices = presentation.get("indices", {})
        indexed_cues = indices.get("audio_cues", {}) if isinstance(indices, dict) else {}
        if isinstance(indexed_cues, dict):
            cue_indices = indexed_cues
    value = cue_indices.get(cue, default)
    return require_int(value, f"{description}.audio.cue_indices.{cue}", 0, 255)


def emit_isometric_tactical_presentation(
    output,
    prefix,
    presentation,
    actors,
    actor_animation_lookups,
    asset_report,
    description,
):
    if presentation is None:
        return "nullptr"
    if not isinstance(presentation, dict):
        raise SystemExit(f"{description} precisa ser objeto")

    capabilities = presentation.get("capabilities", [])
    if not isinstance(capabilities, list) or not capabilities:
        return "nullptr"
    capability_bits = 0
    for capability in capabilities:
        if capability not in ISOMETRIC_TACTICAL_CAPABILITY_BITS:
            raise SystemExit(f"{description}.capabilities contem capability desconhecida: {capability}")
        capability_bits |= ISOMETRIC_TACTICAL_CAPABILITY_BITS[capability]

    layers = presentation.get("layers", {})
    if not isinstance(layers, dict):
        raise SystemExit(f"{description}.layers precisa ser objeto")
    if layers.get("collision") not in (None, "scene_data"):
        raise SystemExit(f"{description}.layers.collision precisa ser scene_data")

    surface_expr = tactical_asset_pointer(
        presentation.get("surface_asset"),
        "tilemap",
        asset_report,
        f"{description}.surface_asset",
    ) if "tactical_surface" in capabilities else "nullptr"
    surface_pages_name = "nullptr"
    surface_page_count = 0
    max_resident_surface_groups = 0
    surface_prefetch_margin_pixels = 0
    surface_pages = presentation.get("surface_pages", [])
    surface_residency = presentation.get("surface_residency")
    if surface_pages:
        if not isinstance(surface_pages, list) or not isinstance(surface_residency, dict):
            raise SystemExit(f"{description}.surface_pages exige surface_residency")
        groups = surface_residency.get("exclusive_bank_groups", [])
        if not isinstance(groups, list) or len(groups) != len(surface_pages):
            raise SystemExit(f"{description}.surface_residency.exclusive_bank_groups precisa cobrir todas as paginas")
        surface_pages_name = f"{prefix}_tactical_surface_pages"
        output.append(f"constexpr gbs::IsoTacticalSurfacePage {surface_pages_name}[] = {{")
        seen_page_groups = set()
        for page_index, page in enumerate(surface_pages):
            if not isinstance(page, dict):
                raise SystemExit(f"{description}.surface_pages[{page_index}] precisa ser objeto")
            group = page.get("bank_group")
            world = page.get("world")
            if not isinstance(group, str) or not group or group not in groups or group in seen_page_groups:
                raise SystemExit(f"{description}.surface_pages[{page_index}].bank_group invalido")
            if not isinstance(world, dict):
                raise SystemExit(f"{description}.surface_pages[{page_index}].world precisa ser objeto")
            seen_page_groups.add(group)
            page_asset = tactical_asset_pointer(
                page.get("asset"), "tilemap", asset_report,
                f"{description}.surface_pages[{page_index}].asset",
            )
            x = require_int(world.get("x"), f"{description}.surface_pages[{page_index}].world.x", -32768, 32767)
            y = require_int(world.get("y"), f"{description}.surface_pages[{page_index}].world.y", -32768, 32767)
            width = require_int(world.get("width"), f"{description}.surface_pages[{page_index}].world.width", 1, 32767)
            height = require_int(world.get("height"), f"{description}.surface_pages[{page_index}].world.height", 1, 32767)
            output.append(
                f"    gbs::IsoTacticalSurfacePage {{ {page_asset}, {cpp_string_literal(group)}, "
                f"gbs::Rect {{ {x}, {y}, {width}, {height} }} }},"
            )
        output.append("};")
        output.append("")
        surface_page_count = len(surface_pages)
        max_resident_surface_groups = require_int(
            surface_residency.get("max_resident_groups"),
            f"{description}.surface_residency.max_resident_groups", 1, len(surface_pages),
        )
        surface_prefetch_margin_pixels = require_int(
            surface_residency.get("prefetch_margin_pixels", 0),
            f"{description}.surface_residency.prefetch_margin_pixels", 0, 65535,
        )
    grid_expr = tactical_asset_pointer(
        presentation.get("grid_asset"),
        "tilemap",
        asset_report,
        f"{description}.grid_asset",
    ) if "tactical_grid_overlay" in capabilities else "nullptr"
    hud_expr = tactical_asset_pointer(
        presentation.get("hud_layout"),
        "tilemap",
        asset_report,
        f"{description}.hud_layout",
    ) if "tactical_hud" in capabilities else "nullptr"

    unit_array_name = "nullptr"
    unit_count = 0
    if "tactical_units" in capabilities:
        units = presentation.get("units", [])
        if not isinstance(units, list) or not units:
            raise SystemExit(f"{description}.units precisa ser lista nao vazia")
        unit_array_name = f"{prefix}_tactical_presentation_units"
        unit_entries = []
        for unit_index, unit in enumerate(units):
            if not isinstance(unit, dict):
                raise SystemExit(f"{description}.units[{unit_index}] precisa ser objeto")
            if not isinstance(unit.get("sheet"), str) or not unit.get("sheet"):
                raise SystemExit(f"{description}.units[{unit_index}].sheet precisa ser string")
            animations = unit.get("animations")
            if not isinstance(animations, dict):
                raise SystemExit(f"{description}.units[{unit_index}].animations precisa ser objeto")
            missing = [name for name in ISOMETRIC_TACTICAL_ANIMATION_BINDINGS if not animations.get(name)]
            if missing:
                raise SystemExit(
                    f"{description}.units[{unit_index}].animations sem estados/direcoes: {', '.join(missing)}"
                )
            actor_index = tactical_actor_index(
                unit,
                actors,
                unit_index,
                f"{description}.units[{unit_index}]",
            )
            if actor_index >= len(actor_animation_lookups):
                raise SystemExit(
                    f"{description}.units[{unit_index}].actor_id nao possui conjunto de animacoes emitido"
                )
            tactical_animation_set = emit_isometric_tactical_animation_set(
                output,
                prefix,
                unit_index,
                unit,
                actor_animation_lookups[actor_index],
                asset_report,
                f"{description}.units[{unit_index}]",
            )
            unit_entries.append(
                f"    gbs::IsoTacticalUnitPresentationData {{ {actor_index}, &{tactical_animation_set} }},"
            )
        output.append(f"constexpr gbs::IsoTacticalUnitPresentationData {unit_array_name}[] = {{")
        output.extend(unit_entries)
        output.append("};")
        output.append("")
        unit_count = len(units)

    prop_array_name = "nullptr"
    prop_count = 0
    if "tactical_props" in capabilities:
        props = presentation.get("props", [])
        if not isinstance(props, list) or not props:
            raise SystemExit(f"{description}.props precisa ser lista nao vazia")
        prop_array_name = f"{prefix}_tactical_presentation_props"
        output.append(f"constexpr gbs::IsoTacticalPropData {prop_array_name}[] = {{")
        prop_kinds = {"objective": 0, "cover": 1, "elevation": 2}
        for prop_index, prop in enumerate(props):
            if not isinstance(prop, dict):
                raise SystemExit(f"{description}.props[{prop_index}] precisa ser objeto")
            asset = prop.get("asset")
            kind = prop.get("kind", "cover")
            if kind not in prop_kinds:
                raise SystemExit(f"{description}.props[{prop_index}].kind invalido: {kind}")
            tile = prop.get("tile", {})
            if not isinstance(tile, dict):
                raise SystemExit(f"{description}.props[{prop_index}].tile precisa ser objeto")
            asset_expr = tactical_metasprite_pointer(
                asset,
                prop_index,
                asset_report,
                f"{description}.props[{prop_index}].asset",
            )
            output.append(
                "    gbs::IsoTacticalPropData { "
                f"{asset_expr}, "
                f"gbs::IsoCoord {{ {int(tile.get('x', 0))}, {int(tile.get('y', 0))}, {int(tile.get('z', 0))} }}, "
                f"static_cast<uint8_t>({prop_kinds[kind]}), "
                f"{'true' if bool(prop.get('animated', False)) else 'false'} "
                "},"
            )
        output.append("};")
        output.append("")
        prop_count = len(props)

    cursor_expr = "nullptr"
    range_expr = "nullptr"
    target_expr = "nullptr"
    emotes_expr = "nullptr"
    feedback_expr = "nullptr"
    marker_indices = {"cursor": 0, "range": 1, "target": 2}
    if "tactical_feedback" in capabilities:
        cursor_expr = tactical_metasprite_pointer(
            presentation.get("cursor_asset"),
            tactical_marker_index(presentation, "cursor", 0, description),
            asset_report,
            f"{description}.cursor_asset",
        )
        range_expr = tactical_metasprite_pointer(
            presentation.get("range_asset"),
            tactical_marker_index(presentation, "range", 1, description),
            asset_report,
            f"{description}.range_asset",
        )
        target_expr = tactical_metasprite_pointer(
            presentation.get("target_asset"),
            tactical_marker_index(presentation, "target", 2, description),
            asset_report,
            f"{description}.target_asset",
        )
        emotes = presentation.get("emotes")
        if not isinstance(emotes, dict):
            raise SystemExit(f"{description}.emotes precisa ser objeto")
        feedback = presentation.get("feedback")
        if not isinstance(feedback, dict):
            raise SystemExit(f"{description}.feedback precisa ser objeto")
        emotes_expr = tactical_metasprite_pointer(
            emotes.get("asset"),
            require_int(emotes.get("index", 0), f"{description}.emotes.index", 0, 255),
            asset_report,
            f"{description}.emotes.asset",
        )
        feedback_expr = tactical_metasprite_pointer(
            feedback.get("asset"),
            require_int(feedback.get("index", 0), f"{description}.feedback.index", 0, 255),
            asset_report,
            f"{description}.feedback.asset",
        )
        marker_indices = {
            "cursor": tactical_marker_index(presentation, "cursor", 0, description),
            "range": tactical_marker_index(presentation, "range", 1, description),
            "target": tactical_marker_index(presentation, "target", 2, description),
        }

    audio_expr = "nullptr"
    music_expr = "nullptr"
    audio_count = 0
    if "tactical_audio" in capabilities:
        audio = presentation.get("audio")
        if not isinstance(audio, dict):
            raise SystemExit(f"{description}.audio precisa ser objeto")
        music_expr = tactical_asset_pointer(
            audio.get("music"),
            "tracker_assets",
            asset_report,
            f"{description}.audio.music",
        )
        audio_array_name = f"{prefix}_tactical_presentation_audio_cues"
        output.append(f"constexpr gbs::SfxAsset {audio_array_name}[] = {{")
        cues = audio.get("cues", {})
        if not isinstance(cues, dict):
            raise SystemExit(f"{description}.audio.cues precisa ser objeto")
        for cue in ISOMETRIC_TACTICAL_AUDIO_CUES:
            if cue not in cues:
                raise SystemExit(f"{description}.audio.cues.{cue} ausente")
            cue_symbol = resolve_project_asset_symbol(
                cues[cue],
                "sfx_assets",
                asset_report,
                f"{description}.audio.cues.{cue}",
            )
            output.append(f"    {cue_symbol},")
            tactical_audio_cue_index(presentation, cue, ISOMETRIC_TACTICAL_AUDIO_CUES.index(cue), description)
        output.append("};")
        output.append("")
        audio_expr = audio_array_name
        audio_count = len(ISOMETRIC_TACTICAL_AUDIO_CUES)

    presentation_name = f"{prefix}_tactical_presentation"
    output.append(f"constexpr gbs::IsoTacticalPresentationData {presentation_name} {{")
    output.extend([
        f"    static_cast<uint16_t>({capability_bits}),",
        f"    {surface_expr},",
        f"    {surface_pages_name},",
        f"    {surface_page_count},",
        f"    static_cast<uint8_t>({max_resident_surface_groups}),",
        f"    static_cast<uint16_t>({surface_prefetch_margin_pixels}),",
        f"    {grid_expr},",
        f"    {hud_expr},",
        f"    {unit_array_name},",
        f"    {unit_count},",
        f"    {prop_array_name},",
        f"    {prop_count},",
        f"    {cursor_expr},",
        f"    {range_expr},",
        f"    {target_expr},",
        f"    {emotes_expr},",
        f"    {feedback_expr},",
        f"    {music_expr},",
        f"    {audio_expr},",
        f"    {audio_count}",
    ])
    output.append("};")
    output.append("")

    marker_name = f"{prefix}_tactical_presentation_markers"
    if "tactical_feedback" in capabilities:
        output.append(
            f"constexpr uint8_t {marker_name}[] = {{ "
            f"{marker_indices['cursor']}, {marker_indices['range']}, {marker_indices['target']} "
            "};"
        )
        output.append("")
    return f"&{presentation_name}"


def resolve_platformer_enemy_visual_exprs(enemy, asset_report, description):
    visual_ref = project_actor_visual_ref(enemy)
    if visual_ref is None:
        return (
            f"static_cast<uint16_t>({int(enemy.get('tile_index', 0))})",
            f"static_cast<uint8_t>({int(enemy.get('palette', 0))})",
        )

    metasprite = resolve_project_metasprite_symbol(visual_ref, None, asset_report, f"{description}.metasprite")
    return (
        f"static_cast<uint16_t>({metasprite}.parts[0].tile_index)",
        f"static_cast<uint8_t>({metasprite}.parts[0].palette)",
    )


def emit_platformer_player_animation_set(output, player, asset_report, base_dir=None):
    if not isinstance(player, dict):
        return "gbs::PlatformerPlayerAnimationSet {}"

    default_symbol = resolve_project_animation_symbol(
        player.get("animation"),
        asset_report,
        "platformer_project.player.animation",
    )
    raw_animations = player.get("animations", {})
    if raw_animations is None:
        raw_animations = {}
    if not isinstance(raw_animations, dict):
        raise SystemExit("platformer_project.player.animations precisa ser objeto")

    symbols = {}
    for state in ("idle", "walk", "jump", "fall", "climb", "wall_slide", "dash", "glide"):
        entry = raw_animations.get(state)
        if entry is None:
            continue
        description = f"platformer_project.player.animations.{state}"
        if isinstance(entry, str):
            symbol = resolve_project_animation_symbol(entry, asset_report, description)
        elif isinstance(entry, dict):
            if entry.get("frame_indices", entry.get("frames")) is not None:
                symbol = emit_topdown_animation_frame_subset(
                    output,
                    "platformer_player",
                    state,
                    entry,
                    asset_report,
                    description,
                    base_dir,
                )
            else:
                symbol = resolve_project_animation_symbol(entry, asset_report, description)
        else:
            raise SystemExit(f"{description} precisa ser string ou objeto")
        symbols[state] = symbol

    idle_symbol = symbols.get("idle", default_symbol)
    expressions = []
    for state in ("idle", "walk", "jump", "fall", "climb", "wall_slide", "dash", "glide"):
        symbol = symbols.get(state, idle_symbol)
        expressions.append(f"&{symbol}" if symbol is not None else "nullptr")
    return f"gbs::PlatformerPlayerAnimationSet {{ {', '.join(expressions)} }}"


def resolve_platformer_platform_visual_exprs(platform, asset_report, description):
    visual_ref = project_actor_visual_ref(platform)
    if visual_ref is None:
        return (
            f"static_cast<uint16_t>({int(platform.get('tile_index', 0))})",
            f"static_cast<uint8_t>({int(platform.get('palette', 0))})",
        )

    metasprite = resolve_project_metasprite_symbol(visual_ref, None, asset_report, f"{description}.metasprite")
    return (
        f"static_cast<uint16_t>({metasprite}.parts[0].tile_index)",
        f"static_cast<uint8_t>({metasprite}.parts[0].palette)",
    )


def project_semantic_asset_ids(project, asset_report):
    if asset_report is None:
        return []
    known_ids = set(asset_pack_symbol_map(asset_report).keys())
    ids = []

    def add(asset_id):
        if asset_id in known_ids and asset_id not in ids:
            ids.append(asset_id)

    def add_ref(ref):
        if isinstance(ref, str):
            add(ref)
        elif isinstance(ref, dict):
            asset_id = ref.get("asset")
            if isinstance(asset_id, str):
                add(asset_id)

    assets = project.get("assets", {})
    if isinstance(assets, dict):
        for value in assets.values():
            if not isinstance(value, list):
                continue
            for item in value:
                add_ref(item)

    backgrounds = project.get("backgrounds", [])
    if isinstance(backgrounds, list):
        for background in backgrounds:
            if not isinstance(background, dict):
                continue
            for key in ("tilemap", "tilemap_asset", "compressed_tilemap", "compressed_tilemap_asset"):
                add_ref(background.get(key))
            layers = background.get("layers", [])
            if isinstance(layers, list):
                for layer in layers:
                    if not isinstance(layer, dict):
                        continue
                    for key in ("tilemap", "tilemap_asset", "compressed_tilemap", "compressed_tilemap_asset"):
                        add_ref(layer.get(key))
            background_video = background.get("video")
            if isinstance(background_video, dict):
                affine = background_video.get("affine")
                if isinstance(affine, dict):
                    add_ref(affine.get("asset"))
                bitmap = background_video.get("bitmap")
                if isinstance(bitmap, dict):
                    add_ref(bitmap.get("asset"))

    video = project.get("video", {})
    if isinstance(video, dict):
        affine = video.get("affine")
        if isinstance(affine, dict):
            add_ref(affine.get("asset"))
        bitmap = video.get("bitmap")
        if isinstance(bitmap, dict):
            add_ref(bitmap.get("asset"))

    pseudo3d_visuals = project.get("pseudo3d_visuals", [])
    if isinstance(pseudo3d_visuals, list):
        for visual in pseudo3d_visuals:
            if not isinstance(visual, dict):
                continue
            add_ref(visual.get("panorama"))
            add_ref(visual.get("floor"))
            add_ref(visual.get("minimap"))

    player = project.get("player", {})
    if isinstance(player, dict):
        add_ref(player.get("metasprite"))
        add_ref(player.get("animation"))
        animation_entries = player.get("animations", [])
        if isinstance(animation_entries, dict):
            animation_entries = list(animation_entries.values())
        if isinstance(animation_entries, list):
            for entry in animation_entries:
                add_ref(entry)

    actor_sprites = project.get("actor_sprites", [])
    if isinstance(actor_sprites, list):
        for actor_sprite in actor_sprites:
            if not isinstance(actor_sprite, dict):
                continue
            add_ref(actor_sprite.get("metasprite"))
            add_ref(actor_sprite.get("animation"))
            animation_entries = actor_sprite.get("animations", [])
            if isinstance(animation_entries, list):
                for entry in animation_entries:
                    add_ref(entry)

    rooms = project.get("rooms", [])
    if isinstance(rooms, list):
        for room in rooms:
            if not isinstance(room, dict):
                continue
            video = room.get("video")
            if isinstance(video, dict):
                affine = video.get("affine")
                if isinstance(affine, dict):
                    add_ref(affine.get("asset"))
            for collection_key in ("npcs", "actors", "enemies", "moving_platforms"):
                actors = room.get(collection_key, [])
                if not isinstance(actors, list):
                    continue
                for actor in actors:
                    if not isinstance(actor, dict):
                        continue
                    add_ref(actor.get("metasprite"))
                    add_ref(actor.get("sprite"))
                    add_ref(actor.get("sprite_asset"))
                    add_ref(actor.get("asset"))
                    add_ref(actor.get("animation"))
                    animation_entries = actor.get("animations", [])
                    if isinstance(animation_entries, list):
                        for entry in animation_entries:
                            add_ref(entry)
                    animation_set = actor.get("animation_set")
                    if isinstance(animation_set, dict):
                        for state in LUTA_VISUAL_ANIMATION_STATES:
                            add_ref(animation_set.get(state))

    dialogue_ui = project.get("dialogue_ui", {})
    if isinstance(dialogue_ui, dict):
        hud_layouts = dialogue_ui.get("hud_layouts", [])
        if isinstance(hud_layouts, list):
            for layout in hud_layouts:
                if not isinstance(layout, dict):
                    continue
                components = layout.get("components", [])
                if not isinstance(components, list):
                    continue
                for component in components:
                    if isinstance(component, dict) and (
                        component.get("kind") == "icon" or
                        (component.get("kind") in ("frame", "bar") and component.get("asset"))
                    ):
                        add_ref(component.get("asset"))
                        for state_asset in component.get("state_assets", []): add_ref(state_asset)
                        if isinstance(component.get("gauge"),dict): add_ref(component["gauge"].get("empty_asset"))

    return ids


def project_referenced_asset_ids(project, asset_report):
    ids = project_semantic_asset_ids(project, asset_report)
    symbols = asset_pack_symbol_map(asset_report)

    def add(asset_id):
        if asset_id in symbols and asset_id not in ids:
            ids.append(asset_id)

    # Include asset IDs and raw C++ expressions in less common fields too
    # (cursor/marker, room bitmap, pseudo-3D and audio references, for example).
    # Extra includes are safe; missing a header can silently rely on a global one.
    referenced_symbols = set()

    def visit(value):
        if isinstance(value, str):
            add(value)
            referenced_symbols.update(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", value))
        elif isinstance(value, dict):
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(project)
    for asset_id, symbol in symbols.items():
        if symbol in referenced_symbols or any(
            token.startswith(symbol + "_") for token in referenced_symbols
        ):
            add(asset_id)
    return ids


def project_auto_includes(project, asset_report):
    headers = asset_pack_header_map(asset_report)
    includes = []
    for asset_id in project_semantic_asset_ids(project, asset_report):
        header = headers.get(asset_id)
        if header is not None and header not in includes:
            includes.append(header)
    return includes


def project_generated_asset_includes(project, generated_assets, asset_report, include_all_pack_assets=True):
    if include_all_pack_assets or asset_report is None:
        return list(generated_assets)
    headers = asset_pack_header_map(asset_report)
    pack_headers = set(headers.values())
    shared_headers = {"dialogue_ui_assets.hpp", "advanced_tools_project_data.hpp"}
    if any(
        header not in pack_headers and header not in shared_headers
        for header in list(generated_assets) + list(project.get("includes") or [])
    ):
        # Custom headers can use pack symbols indirectly. Keep the full set
        # unless their dependencies are known by the generator.
        return list(generated_assets)
    referenced_headers = {
        headers[asset_id] for asset_id in project_referenced_asset_ids(project, asset_report)
        if asset_id in headers
    }
    # Non-pack generated headers (shared UI, advanced tools and custom headers)
    # keep their existing contract. Explicit project.includes are merged later.
    return [
        header for header in generated_assets
        if header not in pack_headers or header in referenced_headers
    ]


def merge_includes(includes, auto_includes):
    merged = []
    for include in list(includes) + list(auto_includes):
        if include not in merged:
            merged.append(include)
    return merged


def emit_project_asset_references(output, project, description, prefix, include_audio=False, asset_report=None):
    assets = project.get("assets", {})
    if assets is None:
        assets = {}
    if not isinstance(assets, dict):
        raise SystemExit(f"{description}.assets precisa ser objeto")

    groups = [
        ("bg_palettes", "gbs::PaletteAsset", "bg_palette_assets"),
        ("obj_palettes", "gbs::PaletteAsset", "obj_palette_assets"),
        ("tile_assets", "gbs::TileAsset", "tile_assets"),
    ]
    if include_audio:
        groups.extend([
            ("sfx_assets", "gbs::SfxAsset", "sfx_assets"),
            ("music_assets", "gbs::MusicAsset", "music_assets"),
            ("pcm_assets", "gbs::PcmAsset", "pcm_assets"),
            ("tracker_assets", "gbs::TrackerAsset", "tracker_assets"),
        ])

    result = {}
    for key, cpp_type, array_suffix in groups:
        items = project_asset_reference_items(project, assets, key, description)
        symbols = [
            resolve_project_asset_symbol(item, key, asset_report, f"{description}.assets.{key}[{index}]")
            for index, item in enumerate(items)
        ]
        if not symbols:
            result[key] = ("nullptr", 0)
            continue
        array_name = f"{prefix}_{array_suffix}"
        output.append(f"const {cpp_type} {array_name}[] = {{")
        for symbol in symbols:
            output.append(f"    {symbol},")
        output.append("};")
        output.append("")
        result[key] = (array_name, len(symbols))
    return result


def event_op_from_json(value):
    op = str(value).strip().lower().replace("-", "_")
    mapping = {
        "end": "End",
        "show_dialogue": "ShowDialogue",
        "dialogue": "ShowDialogue",
        "warp": "Warp",
        "warp_runtime": "WarpRuntime",
        "set_player_direction": "SetPlayerDirection",
        "read_rtc": "ReadRtc",
        "if_rtc": "JumpIfRtcEquals",
        "set_variable": "SetVariable",
        "set_var": "SetVariable",
        "play_sfx": "PlaySfx",
        "sfx": "PlaySfx",
        "play_pcm_sfx": "PlayPcmSfx",
        "pcm_sfx": "PlayPcmSfx",
        "clear_variable": "ClearVariable",
        "clear_var": "ClearVariable",
        "add_variable": "AddVariable",
        "add_var": "AddVariable",
        "jump": "Jump",
        "jump_if_variable_equals": "JumpIfVariableEquals",
        "jump_if_variable_not_equals": "JumpIfVariableNotEquals",
        "jump_if_variable_greater_than": "JumpIfVariableGreaterThan",
        "jump_if_variable_less_than": "JumpIfVariableLessThan",
        "jump_if_variable_equals_variable": "JumpIfVariableEqualsVariable",
        "jump_if_room_equals": "JumpIfRoomEquals",
        "store_engine_field": "StoreEngineField",
        "set_engine_field": "SetEngineField",
        "store_actor_position": "StoreActorPosition",
        "store_actor_direction": "StoreActorDirection",
        "jump_if_engine_field_equals": "JumpIfEngineFieldEquals",
        "jump_if_engine_field_equals_variable": "JumpIfEngineFieldEqualsVariable",
        "jump_if_button_pressed": "JumpIfButtonPressed",
        "wait_button_pressed": "WaitButtonPressed",
        "wait_button": "WaitButtonPressed",
        "add_inventory_item": "AddInventoryItem",
        "remove_inventory_item": "RemoveInventoryItem",
        "jump_if_inventory_at_least": "JumpIfInventoryAtLeast",
        "jump_if_actor_direction": "JumpIfActorDirection",
        "jump_if_actor_at_position": "JumpIfActorAtPosition",
        "jump_if_actor_distance": "JumpIfActorDistance",
        "jump_if_actor_relative": "JumpIfActorRelative",
        "wait_actor_animation": "WaitActorAnimation",
        "multiply_variable": "MultiplyVariable",
        "multiply_var": "MultiplyVariable",
        "divide_variable": "DivideVariable",
        "divide_var": "DivideVariable",
        "mod_variable": "ModuloVariable",
        "mod_var": "ModuloVariable",
        "add_variable_flags": "AddVariableFlags",
        "set_variable_flags": "SetVariableFlags",
        "clear_variable_flags": "ClearVariableFlags",
        "reset_variables_false": "ResetVariablesFalse",
        "random_variable": "RandomVariable",
        "random_var": "RandomVariable",
        "set_random_seed": "SetRandomSeed",
        "rate_limit": "RateLimit",
        "save_game": "SaveGame",
        "load_game": "LoadGame",
        "remove_save_game": "RemoveSaveGame",
        "jump_if_save_exists": "JumpIfSaveExists",
        "store_save_exists": "StoreSaveExists",
        "projectile_load_slot": "ProjectileLoadSlot",
        "cancel_actor_movement": "CancelActorMovement",
        "actor_effects": "ActorEffects",
        "open_menu": "OpenMenu",
        "open_shop": "OpenShop",
        "set_adventure_state": "SetAdventureState",
        "draw_text": "DrawText",
        "luta_start_match": "LutaControl",
        "luta_end_match": "LutaControl",
        "luta_set_super_gauge": "LutaControl",
        "luta_add_super_gauge": "LutaControl",
        "luta_set_guard_power": "LutaControl",
        "luta_set_ism_style": "LutaControl",
        "luta_trigger_super": "LutaControl",
        "luta_enable_alpha_counter": "LutaControl",
        "luta_set_round_timer": "LutaControl",
        "luta_set_rounds_to_win": "LutaControl",
        "launch_projectile": "LaunchProjectile",
        "launch_projectile_slot": "LaunchProjectileSlot",
        "show_actor_gesture": "ShowActorGesture",
        "set_actor_sprite": "SetActorSprite",
        "seed_random": "SeedRandom",
        "set_platformer_state": "SetPlatformerState",
        "lock_script": "LockScript",
        "unlock_script": "UnlockScript",
        "scene_stack_push": "SceneStackPush",
        "scene_stack_clear": "SceneStackClear",
        "scene_stack_previous": "SceneStackPrevious",
        "scene_stack_first": "SceneStackFirst",
        "start_actor_update_script": "StartActorUpdateScript",
        "stop_actor_update_script": "StopActorUpdateScript",
        "start_segment": "StartSegment",
        "stop_segment": "StopSegment",
        "attach_platform_callback": "AttachPlatformCallback",
        "remove_platform_callback": "RemovePlatformCallback",
        "attach_adventure_callback": "AttachAdventureCallback",
        "remove_adventure_callback": "RemoveAdventureCallback",
        "pause_scene_type": "PauseSceneType",
        "resume_scene_type": "ResumeSceneType",
        "show_dialogue_if": "ShowDialogueIf",
        "play_music": "PlayMusic",
        "stop_music": "StopMusic",
        "close_dialogue": "CloseDialogue",
        "wait": "Wait",
        "set_camera_position": "SetCameraPosition",
        "follow_camera": "FollowCamera",
        "lock_camera": "LockCamera",
        "set_camera_shake": "SetCameraShake",
        "fade_out": "FadeOut",
        "fade_in": "FadeIn",
        "visual_effect": "VisualEffect",
        "set_camera_property": "SetCameraProperty",
        "attach_button_event": "AttachButtonEvent",
        "remove_button_event": "RemoveButtonEvent",
        "attach_timer_event": "AttachTimerEvent",
        "restart_timer_event": "RestartTimerEvent",
        "remove_timer_event": "RemoveTimerEvent",
        "move_camera": "MoveCamera",
        "set_camera_bounds_x": "SetCameraBoundsX",
        "set_camera_bounds_y": "SetCameraBoundsY",
        "set_actor_visible": "SetActorVisible",
        "set_actor_active": "SetActorActive",
        "set_actor_collision_enabled": "SetActorCollisionEnabled",
        "set_actor_collision_box": "SetActorCollisionBox",
        "set_all_sprites_visible": "SetAllSpritesVisible",
        "set_actor_position": "SetActorPosition",
        "move_actor": "MoveActor",
        "set_actor_direction": "SetActorDirection",
        "set_actor_speed": "SetActorSpeed",
        "set_actor_animation": "SetActorAnimation",
        "set_actor_animation_speed": "SetActorAnimationSpeed",
        "set_actor_animation_frame": "SetActorAnimationFrame",
        "set_player_animation": "SetPlayerAnimation",
        "player_bounce": "PlayerBounce",
        "link_host": "LinkHost",
        "link_join": "LinkJoin",
        "link_close": "LinkClose",
        "link_transfer": "LinkTransfer",
        "rumble_on": "RumbleOn",
        "rumble_on_for": "RumbleOnFor",
        "rumble_off": "RumbleOff",
        "multiplayer_open": "MultiplayerOpen",
        "multiplayer_close": "MultiplayerClose",
        "multiplayer_set_data": "MultiplayerSetData",
        "multiplayer_sync": "MultiplayerTransfer",
        "multiplayer_read": "MultiplayerGetData",
        "call_script": "CallScript",
        "show_choice": "ShowChoice",
        "choice": "ShowChoice",
        "open_text_input": "OpenTextInput",
        "open_code_lock": "OpenCodeLock",
        "open_equip_menu": "OpenEquipMenu",
        "set_equipped_item": "SetEquippedItem",
        "push_actor": "PushActor",
        "push_actor_away_from_player": "PushActorAwayFromPlayer",
        "set_player_speed_profile": "SetPlayerSpeedProfile",
        "set_player_movement_state": "SetPlayerMovementState",
        "start_game_clock": "StartGameClock",
        "advance_time": "AdvanceTime",
        "set_stat": "SetStat",
        "modify_stat": "ModifyStat",
        "show_stat_bar": "ShowStatBar",
        "show_hearts": "ShowHearts",
        "modify_wallet": "ModifyWallet",
        "show_number_hud": "ShowNumberHud",
        "replace_tile": "ReplaceTile",
        "replace_tile_sequence": "ReplaceTileSequence",
        "overlay_line": "OverlayLine",
        "overlay_show": "OverlayShow",
        "overlay_move": "OverlayMove",
        "overlay_hide": "OverlayHide",
        "set_background": "SetBackground",
        "set_background_palette": "SetBackgroundPalette",
        "set_sprite_palette": "SetSpritePalette",
        "mute_audio_channel": "MuteAudioChannel",
        "set_audio_volume": "SetAudioVolume",
        "fade_audio_volume": "FadeAudioVolume",
        "run_audio_routine": "RunAudioRoutine",
        "audio_routine": "RunAudioRoutine",
        "set_dialogue_text_speed": "SetDialogueTextSpeed",
        "set_dialogue_language": "SetDialogueLanguage",
        "set_text_sfx": "SetTextSfx",
        "set_dialogue_frame": "SetDialogueFrame",
    }
    if op not in mapping:
        raise SystemExit(f"evento op desconhecido: {value}")
    return mapping[op]


def event_int(command, keys, default=0):
    if isinstance(keys, str):
        keys = [keys]
    for key in keys:
        if key in command:
            return int(command[key])
    return default


def event_segment_slot(command, keys=("segment", "segment_index", "index"), default=0):
    for key in keys:
        if key not in command:
            continue
        value = command[key]
        if isinstance(value, int):
            return max(0, value) % 32
        text = str(value).strip()
        if text.lstrip("-").isdigit():
            return max(0, int(text)) % 32
        identifier = pack_safe_identifier(text)
        hash_value = 2166136261
        for byte in identifier.encode("utf-8"):
            hash_value ^= byte
            hash_value = (hash_value * 16777619) & 0xFFFFFFFF
    return hash_value % 32


def event_platform_callback(command):
    return event_enum(
        command,
        ["callback_index", "callback", "callback_name", "name"],
        {
            "fallstart": 0,
            "fall_start": 0,
            "fallend": 1,
            "fall_end": 1,
            "groundstart": 2,
            "ground_start": 2,
            "on_land": 2,
            "land": 2,
            "landed": 2,
            "groundend": 3,
            "ground_end": 3,
            "on_leave_ground": 3,
            "leave_ground": 3,
            "left_ground": 3,
            "jumpstart": 4,
            "jump_start": 4,
            "on_jump": 4,
            "jump": 4,
            "jumpend": 5,
            "jump_end": 5,
            "dashstart": 6,
            "dash_start": 6,
            "dashready": 7,
            "dash_ready": 7,
            "dashend": 8,
            "dash_end": 8,
            "ladderstart": 9,
            "ladder_start": 9,
            "ladderend": 10,
            "ladder_end": 10,
            "wallstart": 11,
            "wall_start": 11,
            "wallend": 12,
            "wall_end": 12,
            "knockbackstart": 13,
            "knockback_start": 13,
            "knockbackend": 14,
            "knockback_end": 14,
            "blankstart": 15,
            "blank_start": 15,
            "blankend": 16,
            "blank_end": 16,
            "runstart": 17,
            "run_start": 17,
            "runend": 18,
            "run_end": 18,
            "floatstart": 19,
            "float_start": 19,
            "floatend": 20,
            "float_end": 20,
        },
        0,
    )


def event_platformer_state(command):
    return event_enum(
        command,
        ["state", "value"],
        {
            "fall": 0,
            "ground": 1,
            "jump": 2,
            "dash": 3,
            "ladder": 4,
            "wall": 5,
            "knockback": 6,
            "blank": 7,
            "run": 8,
            "float": 9,
        },
        0,
    )


def event_adventure_callback(command):
    return event_enum(
        command,
        ["callback_index", "callback", "callback_name", "name"],
        {
            "on_interact": 0,
            "interact": 0,
            "interaction": 0,
            "on_room_enter": 1,
            "room_enter": 1,
            "enter": 1,
            "on_enter": 1,
            "on_room_exit": 2,
            "room_exit": 2,
            "exit": 2,
            "on_exit": 2,
        },
        0,
    )


def event_scene_type(command):
    return event_enum(
        command,
        ["scene_type_index", "scene_type", "type", "name"],
        {
            "topdown": 0,
            "top_down": 0,
            "adventure": 0,
            "platformer": 1,
            "platform": 1,
            "isometric": 2,
            "iso": 2,
            "point_click": 3,
            "pointclick": 3,
            "point_and_click": 3,
            "shmup": 4,
            "shoot_em_up": 4,
            "visual_novel": 5,
            "visualnovel": 5,
            "vn": 5,
            "menu": 6,
            "cutscene": 7,
            "world_map": 8,
            "worldmap": 8,
        },
        0,
    )


def event_flexible_int(command, keys, default=0):
    if isinstance(keys, str):
        keys = [keys]
    for key in keys:
        if key not in command:
            continue
        try:
            return int(command[key])
        except (TypeError, ValueError):
            return default
    return default


def event_bool(command, keys, default=False):
    if isinstance(keys, str):
        keys = [keys]
    for key in keys:
        if key not in command:
            continue
        value = command[key]
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return value != 0
        normalized = str(value).strip().lower()
        if normalized in ("true", "1", "yes", "sim", "on", "hud"):
            return True
        if normalized in ("false", "0", "no", "nao", "off", "none"):
            return False
    return default


def event_enum(command, keys, mapping, default=0):
    if isinstance(keys, str):
        keys = [keys]
    for key in keys:
        if key not in command:
            continue
        value = command[key]
        try:
            return int(value)
        except (TypeError, ValueError):
            normalized = str(value).strip().lower().replace("-", "_")
            return mapping.get(normalized, default)
    return default


def event_rtc_field(command):
    return event_enum(
        command,
        ["field", "component", "value"],
        {
            "year": 0,
            "month": 1,
            "day": 2,
            "weekday": 3,
            "hour": 4,
            "minute": 5,
            "second": 6,
        },
        0,
    )


def event_named_index(command, keys, lookup, default=0):
    if isinstance(keys, str):
        keys = [keys]
    for key in keys:
        if key not in command:
            continue
        value = command[key]
        try:
            return int(value)
        except (TypeError, ValueError):
            if lookup is None:
                return default
            normalized = str(value).strip().lower().replace("-", "_")
            return lookup.get(normalized, default)
    return default


def event_pack_i8_pair(high, low):
    packed = ((int(high) & 0xFF) << 8) | (int(low) & 0xFF)
    return packed - 0x10000 if packed >= 0x8000 else packed


def event_signed_i16(value):
    packed = int(value) & 0xFFFF
    return packed - 0x10000 if packed >= 0x8000 else packed


def event_stat_index(command, keys=("stat", "index"), default=0):
    return event_enum(
        command,
        keys,
        {
            "hp": 0,
            "health": 0,
            "life": 0,
            "energy": 1,
            "stamina": 1,
            "wallet": 2,
            "currency": 2,
        },
        default,
    )


def event_layer_index(command, keys=("layer", "background"), default=0):
    return event_enum(
        command,
        keys,
        {
            "bg0": 0,
            "background0": 0,
            "bg1": 1,
            "background1": 1,
            "bg2": 2,
            "background2": 2,
            "bg3": 3,
            "background3": 3,
        },
        default,
    )


def event_tile_location(command):
    x = max(0, min(63, event_int(command, ["x", "tile_x"], 0)))
    y = max(0, min(63, event_int(command, ["y", "tile_y"], 0)))
    layer = max(0, min(3, event_layer_index(command)))
    return (layer << 12) | (y << 6) | x


def event_engine_field(command, keys=("field", "engine_field"), default=0):
    return event_enum(
        command,
        keys,
        {
            "current_scene_index": 0,
            "current_room": 0,
            "scene": 0,
            "room": 0,
            "camera_x": 1,
            "camera_y": 2,
            "player_x": 3,
            "player_y": 4,
            "plat_blank_grav": 5,
            "platformer_blank_gravity": 5,
        },
        default,
    )


def event_camera_property(command, keys=("property", "camera_property", "field"), default=0):
    return event_enum(
        command,
        keys,
        {
            "x": 0,
            "camera_x": 0,
            "y": 1,
            "camera_y": 1,
            "follow": 2,
            "follow_player": 2,
            "camera_follow": 2,
            "camera_follow_player": 2,
            "delta_x": 3,
            "dx": 3,
            "delta_y": 4,
            "dy": 4,
            "zoom": 5,
            "zoom_percent": 5,
            "smoothing": 6,
            "smooth": 6,
            "pan_x": 7,
            "pan_y": 8,
            "dead_zone_width": 9,
            "deadzone_width": 9,
            "dead_zone_height": 10,
            "deadzone_height": 10,
            "rotation": 11,
        },
        default,
    )


def event_visual_effect(command):
    kind = event_enum(
        command,
        ["effect", "kind", "value"],
        {
            "clear": 0,
            "palette_flash": 1,
            "mosaic": 2,
            "letterbox": 3,
            "wave": 4,
            "water_ripple": 5,
            "parallax_line_scroll": 6,
            "push": 7,
            "pull": 8,
            "mask": 9,
            "color_fade": 10,
            "fade": 11,
        },
        0,
    )
    target = event_enum(
        command,
        ["layer", "target"],
        {
            "all": 0,
            "bg0": 1,
            "bg1": 2,
            "bg2": 3,
            "bg3": 4,
            "obj": 5,
            "screen": 6,
        },
        0,
    )
    return (target << 8) | kind


def event_button_mask(command, keys=("button", "input"), default=1):
    return event_enum(
        command,
        keys,
        {
            "a": 1,
            "b": 2,
            "select": 4,
            "start": 8,
            "right": 16,
            "left": 32,
            "up": 64,
            "down": 128,
            "r": 256,
            "l": 512,
        },
        default,
    )


def event_direction_index(command, keys=("direction", "relation", "value"), default=0):
    return event_enum(
        command,
        keys,
        {
            "down": 0,
            "up": 1,
            "left": 2,
            "right": 3,
            "down_left": 4,
            "down_right": 5,
            "up_left": 6,
            "up_right": 7,
        },
        default,
    )


def event_actor_tile_location(command):
    x = max(0, min(255, event_int(command, ["x", "tile_x"], 0)))
    y = max(0, min(255, event_int(command, ["y", "tile_y"], 0)))
    # Preserve the original low 12 bits; use the spare high bits for large maps.
    return event_signed_i16((x & 63) | ((y & 63) << 6) | ((x & 192) << 6) | ((y & 192) << 8))


def event_value_offset(value, offset):
    return ((max(-128, min(127, offset)) & 0xFF) << 8) | max(0, min(255, value))


def event_overlay_size(command):
    width = max(0, min(240, event_int(command, ["width", "w"], 160)))
    height = max(0, min(160, event_int(command, ["height", "h"], 40)))
    width_tiles = max(0, min(30, (width + 7) // 8))
    height_tiles = max(0, min(20, (height + 7) // 8))
    return (width_tiles << 8) | height_tiles


def event_audio_channel(command):
    return event_enum(
        command,
        ["channel", "target"],
        {
            "music": 0,
            "musica": 0,
            "bgm": 0,
            "sfx": 1,
            "sound": 1,
            "pcm_music": 2,
            "pcm_musica": 2,
            "pcm_bgm": 2,
            "pcm_sfx": 3,
            "all": 4,
            "todos": 4,
        },
        0,
    )


def event_command_from_json(command, description, animation_lookup=None):
    if not isinstance(command, dict):
        raise SystemExit(f"{description} precisa ser objeto")
    op = event_op_from_json(command.get("op", "end"))
    if op == "ShowDialogue":
        return (op, event_int(command, ["line", "index", "dialogue"], 0), 0, 0)
    if op == "ShowDialogueIf":
        return (
            op,
            event_int(command, ["line", "index", "dialogue"], 0),
            event_int(command, ["variable", "var"], 0),
            event_int(command, ["value"], 0),
        )
    if op == "Warp":
        position = command.get("position", None)
        if isinstance(position, dict):
            x = int(position.get("x", command.get("x", 0)))
            y = int(position.get("y", command.get("y", 0)))
        else:
            x = event_int(command, ["x"], 0)
            y = event_int(command, ["y"], 0)
        return (op, event_int(command, ["room", "target_room"], 0), x, y)
    if op == "WarpRuntime":
        position = command.get("position", None)
        if isinstance(position, dict):
            x = int(position.get("x", command.get("x", 0)))
            y = int(position.get("y", command.get("y", 0)))
        else:
            x = event_int(command, ["x"], 0)
            y = event_int(command, ["y"], 0)
        runtime = event_enum(
            command,
            ["runtime", "runtime_kind"],
            {
                "topdown": 0,
                "top_down": 0,
                "platformer": 1,
                "platform": 1,
                "isometric": 2,
                "iso": 2,
                "menu": 3,
                "ui": 3,
                "shmup": 4,
                "point_click": 5,
                "pointandclick": 5,
                "dungeon_crawler": 6,
                "dungeoncrawler": 6,
                "racing": 7,
                "cutscene": 8,
                "visual_novel": 9,
                "visualnovel": 9,
                "world_map": 10,
                "worldmap": 10,
                "battle_rpg": 11,
                "battlerpg": 11,
                "luta": 12,
                "fight": 12,
                "fighting": 12,
            },
            0,
        )
        room = max(0, min(0x0FFF, event_int(command, ["room", "target_room"], 0)))
        return (op, event_signed_i16((runtime << 12) | room), x, y)
    if op == "SetPlayerDirection":
        direction = event_enum(
            command,
            ["direction", "value", "index"],
            {
                "down": 0,
                "south": 0,
                "up": 1,
                "north": 1,
                "left": 2,
                "west": 2,
                "right": 3,
                "east": 3,
                "down_left": 4,
                "south_west": 4,
                "down_right": 5,
                "south_east": 5,
                "up_left": 6,
                "north_west": 6,
                "up_right": 7,
                "north_east": 7,
            },
            0,
        )
        return (op, max(0, min(7, direction)), 0, 0)
    if op == "ReadRtc":
        return (
            op,
            event_rtc_field(command),
            event_int(command, ["variable", "var", "target"], 0),
            0,
        )
    if op in ("SceneStackPush", "SceneStackPrevious", "SceneStackFirst"):
        runtime = event_enum(
            command,
            ["runtime", "runtime_kind"],
            {
                "topdown": 0,
                "top_down": 0,
                "platformer": 1,
                "platform": 1,
                "isometric": 2,
                "iso": 2,
                "menu": 3,
                "ui": 3,
                "shmup": 4,
                "point_click": 5,
                "pointandclick": 5,
                "dungeon_crawler": 6,
                "dungeoncrawler": 6,
                "racing": 7,
                "cutscene": 8,
                "visual_novel": 9,
                "visualnovel": 9,
                "world_map": 10,
                "worldmap": 10,
                "battle_rpg": 11,
                "battlerpg": 11,
                "luta": 12,
                "fight": 12,
                "fighting": 12,
            },
            0,
        )
        return (op, runtime, 0, 0)
    if op in ("SetVariable", "AddVariable", "MultiplyVariable", "DivideVariable", "ModuloVariable"):
        return (
            op,
            event_int(command, ["variable", "var"], 0),
            event_int(command, ["value", "factor", "amount"], 0),
            0,
        )
    if op in ("AddVariableFlags", "SetVariableFlags", "ClearVariableFlags"):
        return (
            op,
            event_int(command, ["variable", "var"], 0),
            event_int(command, ["mask", "flags", "value"], 0),
            0,
        )
    if op == "ResetVariablesFalse":
        return (op, 0, 0, 0)
    if op == "RandomVariable":
        return (
            op,
            event_int(command, ["variable", "var"], 0),
            event_int(command, ["min", "minimum", "low"], 0),
            event_int(command, ["max", "maximum", "high"], 100),
        )
    if op == "SetRandomSeed":
        return (op, event_int(command, ["variable", "var"], 0), 0, 0)
    if op == "SeedRandom":
        return (op, 0, 0, 0)
    if op == "ClearVariable":
        return (op, event_int(command, ["variable", "var"], 0), 0, 0)
    if op in ("LinkHost", "LinkJoin"):
        return (
            op,
            event_int(command, ["script", "event", "index"], -1),
            max(1, min(600, event_int(command, ["timeout_frames", "frames", "timeout"], 4))),
            0,
        )
    if op == "LinkClose":
        return (op, 0, 0, 0)
    if op == "LinkTransfer":
        return (
            op,
            event_int(command, ["variable", "var"], 0),
            max(0, min(255, event_int(command, ["value", "byte", "outgoing"], 0))),
            max(1, min(600, event_int(command, ["timeout_frames", "frames", "timeout"], 4))),
        )
    if op == "RumbleOn":
        return (op, 0, 0, 0)
    if op == "RumbleOnFor":
        return (op, max(1, min(255, event_int(command, ["frames", "duration"], 60))), 0, 0)
    if op == "RumbleOff":
        return (op, 0, 0, 0)
    if op == "MultiplayerOpen":
        return (op, max(2, min(4, event_int(command, ["players", "player_count"], 2))), 0, 0)
    if op == "MultiplayerClose":
        return (op, 0, 0, 0)
    if op == "MultiplayerSetData":
        return (op, max(0, min(65535, event_int(command, ["value", "data"], 0))), 0, 0)
    if op == "MultiplayerTransfer":
        return (op, 0, 0, 0)
    if op == "MultiplayerGetData":
        return (
            op,
            event_int(command, ["var_player", "player"], 0),
            event_int(command, ["var_count", "count"], 0),
            event_int(command, ["var_base", "base"], 0),
        )
    if op == "RateLimit":
        return (
            op,
            event_int(command, ["slot", "index"], 0),
            max(1, event_int(command, ["frames", "duration"], 1)),
            event_int(command, ["offset"], 2),
        )
    if op in ("SaveGame", "LoadGame", "RemoveSaveGame"):
        return (op, event_int(command, ["slot", "index"], 0), 0, 0)
    if op == "JumpIfSaveExists":
        return (
            op,
            event_int(command, ["slot", "index"], 0),
            0,
            event_int(command, ["offset"], 2),
        )
    if op == "StoreSaveExists":
        return (
            op,
            event_int(command, ["slot", "index"], 0),
            event_int(command, ["variable", "var"], 0),
            0,
        )
    if op == "LutaControl":
        verb = str(command.get("op", "")).strip().lower()
        actions = ["luta_start_match", "luta_end_match", "luta_set_super_gauge", "luta_add_super_gauge",
                   "luta_set_guard_power", "luta_set_ism_style", "luta_trigger_super", "luta_enable_alpha_counter",
                   "luta_set_round_timer", "luta_set_rounds_to_win"]
        if verb not in actions:
            raise SystemExit("LutaControl requer um controle de Luta registrado")
        target = event_int(command, ["actor"], 0)
        value = event_int(command, ["amount", "index"], 0)
        if verb == "luta_start_match":
            target, value = event_int(command, ["index"], 0), 0
        elif verb == "luta_enable_alpha_counter":
            value = 1 if event_bool(command, ["value"], False) else 0
        elif verb == "luta_set_round_timer":
            target, value = max(1, min(32767, event_int(command, ["frames"], 60))), 0
        elif verb == "luta_set_rounds_to_win":
            target, value = max(1, min(255, event_int(command, ["count"], 2))), 0
        return (op, actions.index(verb), target, value)
    if op == "ActorEffects":
        return (op, event_int(command, ["actor"], -1), event_int(command, ["index"], 0), event_int(command, ["frames"], 30), event_int(command, ["intensity"], 50))
    if op == "CancelActorMovement":
        return (op, event_int(command, ["actor"], -1), 0, 0)
    if op == "ProjectileLoadSlot":
        return (
            op,
            event_int(command, ["slot", "index"], 0),
            max(1, event_int(command, ["damage"], 1)),
            max(1, event_int(command, ["speed", "speed_x100"], 100)),
            event_int(command, ["sprite"], -1),
        )
    if op in ("LaunchProjectile", "LaunchProjectileSlot"):
        return (
            op,
            event_int(command, ["actor", "actor_index", "index"], 0),
            event_int(command, ["slot", "projectile_slot"], 0),
            event_direction_index(command),
        )
    if op == "ShowActorGesture":
        return (
            op,
            event_int(command, ["actor", "actor_index", "index"], 0),
            event_int(command, ["index", "gesture_index", "value", "gesture"], 0),
            max(1, min(600, event_int(command, ["frames", "duration"], 60))),
        )
    if op == "SetActorSprite":
        return (
            op,
            event_int(command, ["actor", "actor_index", "index"], 0),
            event_int(command, ["sprite", "sprite_index", "value"], 0),
            0,
        )
    if op == "SetBackground":
        index = event_int(command, ["index", "background"], -1)
        if index < 0 or index > 32767:
            raise SystemExit(f"{description}: indice de fundo invalido")
        return (op, index, 0, 0)
    if op in ("SetBackgroundPalette", "SetSpritePalette"):
        return (
            op,
            event_int(command, ["index", "palette_index", "value"], 0),
            max(0, min(600, event_int(command, ["frames", "duration"], 0))),
            0,
        )
    if op in ("LockScript", "UnlockScript"):
        return (op, event_int(command, ["script", "script_index", "index"], 0), 0, 0)
    if op in ("SceneStackPush", "SceneStackClear", "SceneStackPrevious", "SceneStackFirst"):
        return (op, 0, 0, 0)
    if op in ("StartActorUpdateScript", "StopActorUpdateScript"):
        return (op, event_int(command, ["actor", "actor_index", "index"], 0), 0, 0)
    if op == "StartSegment":
        return (op, event_int(command, ["slot", "segment", "segment_index", "index"], 0), event_int(command, ["script"], -1), 0)
    if op == "StopSegment":
        return (op, event_int(command, ["slot", "segment", "segment_index", "index"], 0), 0, 0)
    if op == "AttachPlatformCallback":
        return (
            op,
            event_platform_callback(command),
            event_int(command, ["script", "event", "index"], 0),
            0,
        )
    if op == "RemovePlatformCallback":
        return (op, event_platform_callback(command), 0, 0)
    if op == "SetPlatformerState":
        return (op, event_platformer_state(command), 0, 0)
    if op == "AttachAdventureCallback":
        return (
            op,
            event_adventure_callback(command),
            event_int(command, ["script", "event", "index"], 0),
            0,
        )
    if op == "RemoveAdventureCallback":
        return (op, event_adventure_callback(command), 0, 0)
    if op in ("PauseSceneType", "ResumeSceneType"):
        return (op, event_scene_type(command), 0, 0)
    if op == "Jump":
        return (op, event_int(command, ["offset"], 0), 0, 0)
    if op in (
        "JumpIfVariableEquals",
        "JumpIfVariableNotEquals",
        "JumpIfVariableGreaterThan",
        "JumpIfVariableLessThan",
    ):
        return (
            op,
            event_int(command, ["variable", "var"], 0),
            event_int(command, ["value"], 0),
            event_int(command, ["offset"], 0),
        )
    if op == "JumpIfVariableEqualsVariable":
        return (
            op,
            event_int(command, ["variable", "var"], 0),
            event_int(command, ["other_variable", "other_var", "other"], 0),
            event_int(command, ["offset"], 0),
        )
    if op == "JumpIfRoomEquals":
        return (
            op,
            event_int(command, ["room", "scene", "target_room"], 0),
            0,
            event_int(command, ["offset"], 0),
        )
    if op == "StoreEngineField":
        return (
            op,
            event_engine_field(command),
            event_int(command, ["variable", "var"], 0),
            0,
        )
    if op == "SetEngineField":
        return (
            op,
            event_engine_field(command),
            event_int(command, ["value"], 0),
            0,
        )
    if op == "StoreActorPosition":
        return (
            op,
            event_int(command, ["actor", "actor_index", "index"], 0),
            event_int(command, ["variable_x", "var_x", "x_variable"], 0),
            event_int(command, ["variable_y", "var_y", "y_variable"], 0),
        )
    if op == "StoreActorDirection":
        return (
            op,
            event_int(command, ["actor", "actor_index", "index"], 0),
            event_int(command, ["variable", "var"], 0),
            0,
        )
    if op == "JumpIfEngineFieldEquals":
        return (
            op,
            event_engine_field(command),
            event_int(command, ["value"], 0),
            event_int(command, ["offset"], 0),
        )
    if op == "JumpIfRtcEquals":
        return (
            op,
            event_rtc_field(command),
            event_int(command, ["value", "expected"], 0),
            event_int(command, ["offset"], 0),
        )
    if op == "JumpIfEngineFieldEqualsVariable":
        return (
            op,
            event_engine_field(command),
            event_int(command, ["variable", "var"], 0),
            event_int(command, ["offset"], 0),
        )
    if op == "JumpIfButtonPressed":
        return (
            op,
            event_button_mask(command),
            0,
            event_int(command, ["offset"], 0),
        )
    if op == "WaitButtonPressed":
        return (op, event_button_mask(command), 0, 0)
    if op == "AttachButtonEvent":
        return (
            op,
            event_button_mask(command),
            event_int(command, ["script", "event", "index"], 0),
            1 if event_bool(command, ["override", "override_default"], False) else 0,
        )
    if op == "RemoveButtonEvent":
        return (op, event_button_mask(command), 0, 0)
    if op == "AttachTimerEvent":
        return (
            op,
            max(1, event_int(command, ["frames", "duration"], 1)),
            event_int(command, ["script", "event", "index"], 0),
            0,
        )
    if op in ("RestartTimerEvent", "RemoveTimerEvent"):
        return (op, event_int(command, ["script", "event", "index"], 0), 0, 0)
    if op == "WaitActorAnimation":
        return (op, event_int(command, ["actor", "actor_index", "index"], 0), 0, 0)
    if op in ("AddInventoryItem", "RemoveInventoryItem"):
        return (
            op,
            event_int(command, ["item", "item_index", "index"], 0),
            event_int(command, ["quantity", "count", "amount"], 1),
            0,
        )
    if op == "JumpIfInventoryAtLeast":
        return (
            op,
            event_int(command, ["item", "item_index", "index"], 0),
            event_int(command, ["quantity", "count", "amount"], 1),
            event_int(command, ["offset"], 0),
        )
    if op == "JumpIfActorDirection":
        return (
            op,
            event_int(command, ["actor", "actor_index", "index"], 0),
            event_direction_index(command),
            event_int(command, ["offset"], 0),
        )
    if op == "JumpIfActorAtPosition":
        return (
            op,
            event_int(command, ["actor", "actor_index", "index"], 0),
            event_actor_tile_location(command),
            event_int(command, ["offset"], 0),
        )
    if op == "JumpIfActorDistance":
        return (
            op,
            event_int(command, ["actor", "actor_index", "index"], 0),
            event_int(command, ["other_actor", "other_actor_index", "other"], 0),
            event_value_offset(
                event_int(command, ["distance", "max_distance", "value"], 1),
                event_int(command, ["offset"], 0),
            ),
        )
    if op == "JumpIfActorRelative":
        return (
            op,
            event_int(command, ["actor", "actor_index", "index"], 0),
            event_int(command, ["other_actor", "other_actor_index", "other"], 0),
            event_value_offset(event_direction_index(command, ["relation", "direction", "value"]), event_int(command, ["offset"], 0)),
        )
    if op == "PlayPcmSfx":
        return (
            op,
            event_int(command, ["index", "asset"], 0),
            max(0, min(15, event_int(command, ["volume"], 15))),
            max(0, min(255, event_int(command, ["priority"], 8))),
        )
    if op in ("PlaySfx", "PlayMusic", "RunAudioRoutine"):
        return (op, event_int(command, ["index", "asset"], 0), 0, 0)
    if op == "SetDialogueTextSpeed":
        return (op, event_int(command, ["frames", "speed", "value"], 0), 0, 0)
    if op == "SetTextSfx":
        return (op, event_int(command, ["index", "asset", "sfx"], 0), 0, 0)
    if op == "SetDialogueFrame":
        return (op, event_int(command, ["index", "frame", "value"], 0), 0, 0)
    if op == "Wait":
        return (op, event_int(command, ["frames", "duration"], 0), 0, 0)
    if op in ("FadeOut", "FadeIn"):
        return (op, event_int(command, ["frames", "duration"], 30), 0, 0)
    if op == "VisualEffect":
        result = (
            op,
            event_visual_effect(command),
            max(0, min(3600, event_int(command, ["frames", "duration"], 30))),
            max(0, min(100, event_int(command, ["intensity", "strength", "amount"], 50))),
        )
        phase = str(command.get("phase", "")).strip().lower()
        if phase in ("cover", "out", "reveal", "in"):
            return result + (1 if phase in ("cover", "out") else 2,)
        return result
    if op == "SetDialogueLanguage":
        return (op, max(0, min(3, event_int(command, ["locale", "language"], 0))), 0, 0)
    if op == "SetCameraPosition":
        position = command.get("position", None)
        if isinstance(position, dict):
            return (op, int(position.get("x", 0)), int(position.get("y", 0)), 0)
        return (op, event_int(command, ["x"], 0), event_int(command, ["y"], 0), 0)
    if op == "SetCameraShake":
        return (
            op,
            event_int(command, ["frames", "duration", "value"], 0),
            event_int(command, ["magnitude", "amount", "strength"], 2),
            0,
        )
    if op == "SetCameraProperty":
        return (
            op,
            event_camera_property(command),
            event_int(command, ["value"], 0),
            0,
        )
    if op == "MoveCamera":
        return (
            op,
            event_int(command, ["dx", "delta_x", "x"], 0),
            event_int(command, ["dy", "delta_y", "y"], 0),
            0,
        )
    if op == "SetCameraBoundsX":
        return (
            op,
            event_int(command, ["min", "min_x", "x"], 0),
            event_int(command, ["max", "max_x", "right"], 0),
            0,
        )
    if op == "SetCameraBoundsY":
        return (
            op,
            event_int(command, ["min", "min_y", "y"], 0),
            event_int(command, ["max", "max_y", "bottom"], 0),
            0,
        )
    if op == "ReplaceTile":
        return (
            op,
            event_tile_location(command),
            event_int(command, ["tile", "tile_id", "value"], 0),
            max(1, min(64, event_int(command, ["count", "length"], 1))),
        )
    if op == "ReplaceTileSequence":
        variable = max(0, min(15, event_int(command, ["variable", "var"], 0)))
        frames = max(1, min(255, event_int(command, ["frames", "count", "length"], 1)))
        tile = max(0, min(1023, event_int(command, ["tile", "tile_id", "value"], 0)))
        tile_asset = event_int(command, ["tile_asset"], -1)
        packed_tile = tile
        if tile_asset >= 0:
            packed_tile |= (max(0, min(30, tile_asset)) + 1) << 10
        return (
            op,
            event_tile_location(command),
            packed_tile,
            (frames << 8) | variable,
        )
    if op == "OverlayLine":
        return (op, event_int(command, ["line", "y", "height"], 0), 0, 0)
    if op == "OverlayShow":
        return (
            op,
            max(0, min(240, event_int(command, ["x"], 0))),
            max(0, min(160, event_int(command, ["y"], 0))),
            event_overlay_size(command),
        )
    if op == "OverlayMove":
        return (
            op,
            max(0, min(240, event_int(command, ["x"], 0))),
            max(0, min(160, event_int(command, ["y"], 0))),
            max(0, min(600, event_int(command, ["frames", "duration"], 30))),
        )
    if op == "OverlayHide":
        return (op, max(0, min(600, event_int(command, ["frames", "duration"], 30))), 0, 0)
    if op == "MuteAudioChannel":
        return (
            op,
            event_audio_channel(command),
            1 if event_bool(command, ["muted", "mute", "value", "enabled"], True) else 0,
            0,
        )
    if op == "SetAudioVolume":
        return (
            op,
            event_audio_channel(command),
            max(0, min(15, event_int(command, ["volume", "value"], 15))),
            0,
        )
    if op == "FadeAudioVolume":
        return (
            op,
            event_audio_channel(command),
            max(0, min(15, event_int(command, ["volume", "target", "value"], 15))),
            max(0, min(3600, event_int(command, ["frames", "duration"], 30))),
        )
    if op in ("SetActorVisible", "SetActorActive", "SetActorSpeed"):
        return (
            op,
            event_int(command, ["actor", "actor_index", "index"], 0),
            event_int(command, ["value", "visible", "active", "direction", "speed"], 0),
            0,
        )
    if op == "SetActorCollisionEnabled":
        return (
            op,
            event_int(command, ["actor", "actor_index", "index"], 0),
            1 if event_bool(command, ["value", "enabled", "active"], True) else 0,
            0,
        )
    if op == "SetActorCollisionBox":
        offset_x = event_int(command, ["offset_x", "offsetX", "x"], 0)
        offset_y = event_int(command, ["offset_y", "offsetY", "y"], 0)
        width = max(0, event_int(command, ["width", "w"], 16))
        height = max(0, event_int(command, ["height", "h"], 16))
        return (
            op,
            event_int(command, ["actor", "actor_index", "index"], 0),
            event_pack_i8_pair(offset_x, offset_y),
            event_pack_i8_pair(width, height),
        )
    if op == "SetAllSpritesVisible":
        return (
            op,
            1 if event_bool(command, ["value", "visible", "enabled"], True) else 0,
            0,
            0,
        )
    if op == "SetActorDirection":
        return (
            op,
            event_int(command, ["actor", "actor_index", "index"], 0),
            event_direction_index(command),
            0,
        )
    if op == "SetActorAnimation":
        return (
            op,
            event_int(command, ["actor", "actor_index", "index"], 0),
            event_named_index(command, ["animation", "value", "index"], animation_lookup, 0),
            0,
        )
    if op == "SetPlayerAnimation":
        return (
            op,
            event_named_index(command, ["animation", "value", "index"], animation_lookup, 0),
            0,
            0,
        )
    if op == "PlayerBounce":
        return (
            op,
            max(1, min(8, event_int(command, ["height_tiles", "height", "tiles", "value"], 1))),
            max(1, min(120, event_int(command, ["frames", "duration"], 20))),
            0,
        )
    if op == "SetActorAnimationSpeed":
        return (
            op,
            event_int(command, ["actor", "actor_index", "index"], 0),
            event_int(command, ["percent", "speed", "value"], 100),
            0,
        )
    if op == "SetActorAnimationFrame":
        return (
            op,
            event_int(command, ["actor", "actor_index", "index"], 0),
            event_int(command, ["frame", "value"], 0),
            0,
        )
    if op in ("SetActorPosition", "MoveActor"):
        position = command.get("position", command.get("delta", None))
        if isinstance(position, dict):
            x = int(position.get("x", command.get("x", 0)))
            y = int(position.get("y", command.get("y", 0)))
        else:
            x = event_int(command, ["x", "dx"], 0)
            y = event_int(command, ["y", "dy"], 0)
        return (op, event_int(command, ["actor", "actor_index", "index"], 0), x, y)
    if op == "CallScript":
        return (op, event_int(command, ["script", "index"], 0), 0, 0)
    if op in ("StopMusic", "CloseDialogue", "FollowCamera", "LockCamera", "End"):
        return (op, 0, 0, 0)
    if op == "DrawText":
        return (op, event_int(command, ["line"], 0), event_int(command, ["x"], 0), event_int(command, ["y"], 0), 1 if command.get("layer")=="overlay" else 0)
    if op == "SetAdventureState":
        return (op, event_int(command, ["index"], 0), 0, 0)
    if op == "OpenMenu":
        return (op, event_int(command, ["group"], 0), event_int(command, ["variable"], 0), 0)
    if op == "OpenShop":
        return (op, event_int(command, ["actor"], -1), 0, 0)
    if op == "ShowChoice":
        return (op, event_int(command, ["group", "index", "choice"], 0), 0, 0)
    if op == "OpenTextInput":
        return (
            op,
            event_int(command, ["variable", "var"], 0),
            event_int(command, ["max_length", "maxLength", "length"], 8),
            event_enum(command, ["charset"], {"latin_upper": 1, "latin_lower": 2, "numeric": 3}, 0),
        )
    if op == "OpenCodeLock":
        return (
            op,
            event_int(command, ["variable", "var"], 0),
            event_int(command, ["digits"], 4),
            event_flexible_int(command, ["code", "value"], 0),
        )
    if op == "OpenEquipMenu":
        return (
            op,
            event_int(command, ["slots"], 5),
            1 if event_bool(command, ["pause", "paused"], True) else 0,
            0,
        )
    if op == "SetEquippedItem":
        return (
            op,
            event_int(command, ["slot"], 0),
            event_flexible_int(command, ["item", "item_index", "index"], 0),
            0,
        )
    if op == "PushActor":
        return (op, event_int(command, ["actor"], -1), 1 if event_bool(command, ["value"], False) else 0, 0)
    if op == "PushActorAwayFromPlayer":
        return (
            op,
            event_int(command, ["actor", "actor_index", "index"], 0),
            event_int(command, ["tiles", "distance", "value"], 1),
            0,
        )
    if op == "SetPlayerSpeedProfile":
        return (
            op,
            event_int(command, ["walk_speed", "walkSpeed", "walk"], 100),
            event_int(command, ["run_speed", "runSpeed", "run"], 160),
            event_int(command, ["stamina_cost", "staminaCost", "energy_cost"], 0),
        )
    if op == "SetPlayerMovementState":
        return (
            op,
            event_enum(command, ["state"], {"normal": 0, "swimming": 1, "running": 2, "locked": 3}, 0),
            event_enum(command, ["tile_tag", "tileTag"], {"": 0, "water": 1, "grass": 2, "ice": 3}, 0),
            0,
        )
    if op == "StartGameClock":
        return (
            op,
            event_int(command, ["minutes_per_tick", "minutesPerTick"], 10),
            event_int(command, ["frames_per_tick", "framesPerTick"], 180),
            1 if event_bool(command, ["hud", "hud_enabled"], True) else 0,
        )
    if op == "AdvanceTime":
        return (op, event_int(command, ["minutes", "value"], 60), 0, 0)
    if op == "SetStat":
        return (
            op,
            event_stat_index(command),
            event_int(command, ["current", "value"], 0),
            event_int(command, ["max", "maximum"], event_int(command, ["current", "value"], 0)),
        )
    if op == "ModifyStat":
        return (
            op,
            event_stat_index(command),
            event_int(command, ["delta", "amount", "value"], 0),
            0,
        )
    if op == "ShowStatBar":
        return (
            op,
            event_stat_index(command),
            event_int(command, ["x"], 8),
            event_int(command, ["width"], 64),
        )
    if op == "ShowHearts":
        return (
            op,
            event_stat_index(command),
            event_int(command, ["units_per_heart", "unitsPerHeart"], 4),
            event_int(command, ["hearts", "count"], 4),
        )
    if op == "ModifyWallet":
        return (
            op,
            event_int(command, ["variable", "var"], 0),
            event_int(command, ["delta", "amount", "value"], 0),
            event_int(command, ["max", "maximum"], 999),
        )
    if op == "ShowNumberHud":
        return (
            op,
            event_int(command, ["variable", "var"], 0),
            event_int(command, ["x"], 200),
            event_int(command, ["digits"], 3),
        )
    raise SystemExit(f"evento op ainda nao suportado no export topdown: {op}")


def emit_event_script(output, name, commands, description, animation_lookup=None):
    if commands is None:
        return "gbs::empty_event_script()"
    if not isinstance(commands, list):
        raise SystemExit(f"{description} precisa ser lista")
    if not commands:
        return "gbs::empty_event_script()"

    parsed = [
        event_command_from_json(command, f"{description}[{index}]", animation_lookup=animation_lookup)
        for index, command in enumerate(commands)
    ]
    if parsed[-1][0] != "End":
        parsed.append(("End", 0, 0, 0))

    output.append(f"constexpr gbs::EventCommand {name}_commands[] = {{")
    for command in parsed:
        op, a, b, c = command[:4]
        d = command[4] if len(command) > 4 else 0
        if d:
            output.append(f"    gbs::EventCommand {{ gbs::EventOp::{op}, {a}, {b}, {c}, {d} }},")
        else:
            output.append(f"    gbs::EventCommand {{ gbs::EventOp::{op}, {a}, {b}, {c} }},")
    output.append("};")
    output.append("")
    return f"gbs::EventScript {{ {name}_commands, {len(parsed)} }}"


def emit_topdown_project_scripts(output, topdown_project):
    scripts = topdown_project.get("scripts", topdown_project.get("event_scripts", []))
    if scripts is None:
        scripts = []
    if not isinstance(scripts, list):
        raise SystemExit("topdown_project.scripts precisa ser lista")

    project_script_entries = []
    for script_index, script in enumerate(scripts):
        if isinstance(script, list):
            commands = script
        elif isinstance(script, dict):
            commands = script.get("script", script.get("commands", []))
        else:
            raise SystemExit(f"topdown_project.scripts[{script_index}] precisa ser objeto ou lista")
        project_script_entries.append(
            emit_event_script(
                output,
                f"project_script_{script_index}",
                commands,
                f"topdown_project.scripts[{script_index}].script",
            )
        )
    return project_script_entries


def emit_choice_translations(output, choice, symbol, description):
    source_locale = choice.get("source_locale", choice.get("sourceLocale", ""))
    default_locale = choice.get("default_locale", choice.get("defaultLocale", ""))
    translations = choice.get("translations", [])
    if not isinstance(source_locale, str):
        raise SystemExit(f"{description}.source_locale precisa ser string")
    if not isinstance(default_locale, str):
        raise SystemExit(f"{description}.default_locale precisa ser string")
    if not isinstance(translations, list):
        raise SystemExit(f"{description}.translations precisa ser lista")
    if not translations:
        return source_locale, default_locale, "nullptr", 0
    output.append(f"constexpr gbs::DialogueTranslation {symbol}[] = {{")
    for index, translation in enumerate(translations):
        translation_description = f"{description}.translations[{index}]"
        if not isinstance(translation, dict):
            raise SystemExit(f"{translation_description} precisa ser objeto")
        locale = translation.get("locale", "")
        text = translation.get("text", "")
        if not isinstance(locale, str) or not locale.strip():
            raise SystemExit(f"{translation_description}.locale precisa ser string nao vazia")
        if not isinstance(text, str):
            raise SystemExit(f"{translation_description}.text precisa ser string")
        output.append(
            "    gbs::DialogueTranslation { "
            f"{cpp_string_literal(locale)}, {cpp_string_literal(normalize_dialogue_font_text(text))} "
            "},"
        )
    output.append("};")
    output.append("")
    return source_locale, default_locale, symbol, len(translations)


def emit_topdown_choice_groups(output, topdown_project):
    project_script_entries = emit_topdown_project_scripts(output, topdown_project)
    choice_groups = topdown_project.get("choice_groups", topdown_project.get("dialogue_choices", []))
    if choice_groups is None:
        choice_groups = []
    if not isinstance(choice_groups, list):
        raise SystemExit("topdown_project.choice_groups precisa ser lista")

    group_entries = []
    for group_index, group in enumerate(choice_groups):
        if not isinstance(group, dict):
            raise SystemExit(f"topdown_project.choice_groups[{group_index}] precisa ser objeto")
        line_index = int(group.get("line", group.get("line_index", 0)))
        variable_index = int(group.get("variable", group.get("variable_index", -1)))
        choices = group.get("choices", [])
        if not isinstance(choices, list) or not choices:
            raise SystemExit(f"topdown_project.choice_groups[{group_index}].choices precisa ser lista nao vazia")

        choice_name = f"choice_group_{group_index}_choices"
        choice_lines = []
        for choice_index, choice in enumerate(choices):
            if not isinstance(choice, dict):
                raise SystemExit(f"topdown_project.choice_groups[{group_index}].choices[{choice_index}] precisa ser objeto")
            choice_description = f"topdown_project.choice_groups[{group_index}].choices[{choice_index}]"
            source_locale, default_locale, translations_symbol, translation_count = emit_choice_translations(
                output,
                choice,
                f"choice_group_{group_index}_choice_{choice_index}_translations",
                choice_description,
            )
            script_index = -1
            script = choice.get("script", None)
            if isinstance(script, list) and script:
                script_expr = emit_event_script(
                    output,
                    f"choice_group_{group_index}_choice_{choice_index}",
                    script,
                    f"topdown_project.choice_groups[{group_index}].choices[{choice_index}].script",
                )
                script_index = len(project_script_entries)
                project_script_entries.append(script_expr)
            choice_lines.append(
                "    gbs::DialogueChoice { "
                f"{cpp_string_literal(normalize_dialogue_font_text(choice.get('text', f'Choice {choice_index + 1}')))}, "
                f"{int(choice.get('value', choice_index + 1))}, "
                f"{script_index}, "
                f"{cpp_optional_string_literal(source_locale)}, "
                f"{cpp_optional_string_literal(default_locale)}, "
                f"{translations_symbol}, "
                f"{translation_count} "
                "},"
            )

        output.append(f"constexpr gbs::DialogueChoice {choice_name}[] = {{")
        output.extend(choice_lines)
        output.append("};")
        output.append("")
        group_entries.append(
            "    gbs::TopDownDialogueChoiceData { "
            f"{line_index}, {choice_name}, {len(choices)}, {variable_index} "
            "},"
        )

    project_scripts_name = "nullptr"
    project_script_count = 0
    if project_script_entries:
        project_scripts_name = "project_scripts"
        project_script_count = len(project_script_entries)
        output.append("constexpr gbs::EventScript project_scripts[] = {")
        for script_expr in project_script_entries:
            output.append(f"    {script_expr},")
        output.append("};")
        output.append("")

    dialogue_choices_name = "nullptr"
    dialogue_choice_count = 0
    if group_entries:
        dialogue_choices_name = "dialogue_choices"
        dialogue_choice_count = len(group_entries)
        output.append("constexpr gbs::TopDownDialogueChoiceData dialogue_choices[] = {")
        output.extend(group_entries)
        output.append("};")
        output.append("")
    return (project_scripts_name, project_script_count, dialogue_choices_name, dialogue_choice_count)


def emit_visual_novel_choice_groups(output, visual_novel_project):
    choice_groups = visual_novel_project.get("choice_groups", visual_novel_project.get("dialogue_choices", []))
    if choice_groups is None:
        choice_groups = []
    if not isinstance(choice_groups, list):
        raise SystemExit("visual_novel_project.choice_groups precisa ser lista")
    if not choice_groups:
        return ("nullptr", 0, "nullptr", 0)

    project_script_entries = []
    group_entries = []
    for group_index, group in enumerate(choice_groups):
        if not isinstance(group, dict):
            raise SystemExit(f"visual_novel_project.choice_groups[{group_index}] precisa ser objeto")
        line_index = int(group.get("line", group.get("line_index", 0)))
        variable_index = int(group.get("variable", group.get("variable_index", -1)))
        choices = group.get("choices", [])
        if not isinstance(choices, list) or not choices:
            raise SystemExit(f"visual_novel_project.choice_groups[{group_index}].choices precisa ser lista nao vazia")

        choice_name = f"visual_novel_choice_group_{group_index}_choices"
        options_name = "nullptr"
        has_choice_options = any(
            isinstance(choice, dict) and (
                "next_scene" in choice or
                "next_scene_index" in choice or
                "target_scene" in choice or
                "required_variable" in choice or
                "required_variable_index" in choice or
                "required_value" in choice or
                "hide_when_unavailable" in choice or
                "on_select" in choice or
                "script" in choice
            )
            for choice in choices
        )
        choice_lines = []
        option_lines = []
        for choice_index, choice in enumerate(choices):
            if not isinstance(choice, dict):
                raise SystemExit(f"visual_novel_project.choice_groups[{group_index}].choices[{choice_index}] precisa ser objeto")
            choice_description = f"visual_novel_project.choice_groups[{group_index}].choices[{choice_index}]"
            source_locale, default_locale, translations_symbol, translation_count = emit_choice_translations(
                output,
                choice,
                f"visual_novel_choice_group_{group_index}_choice_{choice_index}_translations",
                choice_description,
            )
            script_index = -1
            script = choice.get("script", None)
            if not has_choice_options and isinstance(script, list) and script:
                script_expr = emit_event_script(
                    output,
                    f"visual_novel_choice_group_{group_index}_choice_{choice_index}",
                    script,
                    f"visual_novel_project.choice_groups[{group_index}].choices[{choice_index}].script",
                )
                script_index = len(project_script_entries)
                project_script_entries.append(script_expr)
            if has_choice_options:
                script_index = choice_index
                on_select = emit_event_script(
                    output,
                    f"visual_novel_choice_group_{group_index}_choice_{choice_index}_on_select",
                    choice.get("on_select", choice.get("script")),
                    f"visual_novel_project.choice_groups[{group_index}].choices[{choice_index}].on_select",
                )
                required_variable = int(choice.get("required_variable", choice.get("required_variable_index", -1)))
                required_value = int(choice.get("required_value", 1))
                hide_when_unavailable = "true" if bool(choice.get("hide_when_unavailable", True)) else "false"
                next_scene = int(choice.get("next_scene", choice.get("next_scene_index", choice.get("target_scene", -1))))
                option_lines.append(
                    "    gbs::VisualNovelChoiceOptionData { "
                    f"{required_variable}, "
                    f"{required_value}, "
                    f"{hide_when_unavailable}, "
                    f"{next_scene}, "
                    f"{on_select} "
                    "},"
                )
            choice_lines.append(
                "    gbs::DialogueChoice { "
                f"{cpp_string_literal(normalize_dialogue_font_text(choice.get('text', f'Choice {choice_index + 1}')))}, "
                f"{int(choice.get('value', choice_index + 1))}, "
                f"{script_index}, "
                f"{cpp_optional_string_literal(source_locale)}, "
                f"{cpp_optional_string_literal(default_locale)}, "
                f"{translations_symbol}, "
                f"{translation_count} "
                "},"
            )

        output.append(f"constexpr gbs::DialogueChoice {choice_name}[] = {{")
        output.extend(choice_lines)
        output.append("};")
        output.append("")
        if has_choice_options:
            options_name = f"visual_novel_choice_group_{group_index}_options"
            output.append(f"constexpr gbs::VisualNovelChoiceOptionData {options_name}[] = {{")
            output.extend(option_lines)
            output.append("};")
            output.append("")
        group_entries.append(
            "    gbs::VisualNovelChoiceGroupData { "
            f"{line_index}, {choice_name}, {len(choices)}, {variable_index}, {options_name} "
            "},"
        )

    project_scripts_name = "nullptr"
    project_script_count = 0
    if project_script_entries:
        project_scripts_name = "visual_novel_project_scripts"
        project_script_count = len(project_script_entries)
        output.append("constexpr gbs::EventScript visual_novel_project_scripts[] = {")
        for script_expr in project_script_entries:
            output.append(f"    {script_expr},")
        output.append("};")
        output.append("")

    output.append("constexpr gbs::VisualNovelChoiceGroupData visual_novel_choice_groups[] = {")
    output.extend(group_entries)
    output.append("};")
    output.append("")
    return (project_scripts_name, project_script_count, "visual_novel_choice_groups", len(group_entries))


def emit_visual_novel_backgrounds(output, visual_novel_project, asset_report=None):
    backgrounds = visual_novel_project.get("backgrounds", [])
    if backgrounds is None:
        backgrounds = []
    if not isinstance(backgrounds, list):
        raise SystemExit("visual_novel_project.backgrounds precisa ser lista")
    if not backgrounds:
        return ("nullptr", 0)

    output.append("constexpr gbs::VisualNovelBackgroundData visual_novel_backgrounds[] = {")
    for index, background in enumerate(backgrounds):
        if not isinstance(background, dict):
            raise SystemExit(f"visual_novel_project.backgrounds[{index}] precisa ser objeto")
        tilemap = background.get("tilemap", background.get("tilemap_asset"))
        if not isinstance(tilemap, str) or not tilemap:
            raise SystemExit(f"visual_novel_project.backgrounds[{index}].tilemap precisa ser string")
        tilemap_symbol = resolve_project_asset_symbol(
            tilemap,
            "tilemap",
            asset_report,
            f"visual_novel_project.backgrounds[{index}].tilemap",
        )
        layer = background_layer_from_json(background.get("layer", "bg1"))
        output.append(
            "    gbs::VisualNovelBackgroundData { "
            f"{cpp_string_literal(background.get('name', f'background_{index}'))}, "
            f"gbs::BackgroundLayer::{layer}, "
            f"{tilemap_symbol}, "
            f"static_cast<uint16_t>({int(background.get('backdrop_color', 0))}) "
            "},"
        )
    output.append("};")
    output.append("")
    return ("visual_novel_backgrounds", len(backgrounds))


def emit_visual_novel_project_data_header(visual_novel_project, asset_report=None):
    if not isinstance(visual_novel_project, dict):
        raise SystemExit("visual_novel_project precisa ser objeto")
    scenes = visual_novel_project.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        raise SystemExit("visual_novel_project.scenes precisa ser lista nao vazia")

    output = [
        "#pragma once",
        "#include <stddef.h>",
        "#include <stdint.h>",
        "#include \"gbs/runtime_save_restore.hpp\"",
        "#include \"gbs/visual_novel.hpp\"",
    ]
    for include in merge_includes(
        string_list_from_json(visual_novel_project.get("includes", []), "visual_novel_project.includes"),
        project_auto_includes(visual_novel_project, asset_report),
    ):
        output.append(f"#include {cpp_string_literal(include)}")
    output.extend([
        "",
        "namespace gbastudio_visual_novel_project {",
        "",
    ])

    save_config = save_config_from_json(visual_novel_project.get("save"), "visual_novel_project.save", "GBVN", 0)
    emit_save_config(output, save_config)

    asset_refs = emit_project_asset_references(output, visual_novel_project, "visual_novel_project", "visual_novel_project", include_audio=True, asset_report=asset_report)
    backgrounds_name, background_count = emit_visual_novel_backgrounds(output, visual_novel_project, asset_report)
    resource_banks_name, resource_bank_count, resource_bank_groups_name, resource_bank_group_count = emit_project_resource_banks(
        output,
        visual_novel_project,
        "visual_novel_project",
        asset_report,
    )
    resource_bank_upload_sources_name, resource_bank_upload_source_count = emit_resource_bank_upload_sources(output, asset_report)
    portrait_assets = dialogue_portrait_assets_from_json(
        visual_novel_project.get("portrait_assets"),
        "visual_novel_project.portrait_assets",
        asset_report,
    )
    emit_dialogue_portrait_assets(output, portrait_assets)

    dialogue_lines_name, dialogue_line_count = emit_dialogue_lines(
        output,
        visual_novel_project.get("dialogue_lines", []),
        "visual_novel_project.dialogue_lines",
    )

    project_scripts_name, project_script_count, choice_groups_name, choice_group_count = emit_visual_novel_choice_groups(output, visual_novel_project)

    scene_entries = []
    for scene_index, scene in enumerate(scenes):
        if not isinstance(scene, dict):
            raise SystemExit(f"visual_novel_project.scenes[{scene_index}] precisa ser objeto")
        on_enter = emit_event_script(
            output,
            f"visual_novel_scene_{scene_index}_on_enter",
            scene.get("on_enter"),
            f"visual_novel_project.scenes[{scene_index}].on_enter",
        )
        on_exit = emit_event_script(
            output,
            f"visual_novel_scene_{scene_index}_on_exit",
            scene.get("on_exit"),
            f"visual_novel_project.scenes[{scene_index}].on_exit",
        )
        background_index = int(scene.get("background", scene.get("background_index", -1)))
        dialogue_line_index = int(scene.get("line", scene.get("dialogue_line", scene.get("dialogue_line_index", -1))))
        choice_group_index = int(scene.get("choice_group", scene.get("choice_group_index", -1)))
        next_scene_index = int(scene.get("next_scene", scene.get("next_scene_index", -1)))
        auto_advance = "true" if bool(scene.get("auto_advance", False)) else "false"
        resource_group = scene.get("resource_bank_group", scene.get("bank_group"))
        resource_group_expr = cpp_string_literal(resource_group) if isinstance(resource_group, str) and resource_group else "nullptr"
        scene_entries.append(
            "    gbs::VisualNovelSceneData { "
            f"{cpp_string_literal(scene.get('name', f'scene_{scene_index}'))}, "
            f"{background_index}, "
            f"{dialogue_line_index}, "
            f"{choice_group_index}, "
            f"{next_scene_index}, "
            f"{on_enter}, "
            f"{on_exit}, "
            f"{auto_advance}, "
            f"{resource_group_expr} "
            "},"
        )
    output.append("constexpr gbs::VisualNovelSceneData scenes[] = {")
    output.extend(scene_entries)
    output.append("};")
    output.append("")

    output.extend([
        "const gbs::VisualNovelProjectData project {",
        f"    {asset_refs['bg_palettes'][0]},",
        f"    {asset_refs['bg_palettes'][1]},",
        f"    {asset_refs['tile_assets'][0]},",
        f"    {asset_refs['tile_assets'][1]},",
        f"    {backgrounds_name},",
        f"    {background_count},",
        "    scenes,",
        f"    {len(scenes)},",
        f"    {int(visual_novel_project.get('initial_scene', 0))},",
        f"    {dialogue_lines_name},",
        f"    {dialogue_line_count},",
        f"    {project_scripts_name},",
        f"    {project_script_count},",
        f"    {choice_groups_name},",
        f"    {choice_group_count},",
        f"    {resource_banks_name},",
        f"    {resource_bank_count},",
        f"    {resource_bank_groups_name},",
        f"    {resource_bank_group_count},",
        f"    {asset_refs['sfx_assets'][0]},",
        f"    {asset_refs['sfx_assets'][1]},",
        f"    {asset_refs['music_assets'][0]},",
        f"    {asset_refs['music_assets'][1]},",
        f"    {asset_refs['pcm_assets'][0]},",
        f"    {asset_refs['pcm_assets'][1]},",
        f"    {asset_refs['tracker_assets'][0]},",
        f"    {asset_refs['tracker_assets'][1]},",
        f"    {resource_bank_upload_sources_name},",
        f"    {resource_bank_upload_source_count}"
        "};",
        "",
        "} // namespace gbastudio_visual_novel_project",
        "",
    ])
    return "\n".join(output)


def emit_point_click_backgrounds(output, point_click_project, asset_report=None):
    backgrounds = point_click_project.get("backgrounds", [])
    if backgrounds is None:
        backgrounds = []
    if not isinstance(backgrounds, list):
        raise SystemExit("point_click_project.backgrounds precisa ser lista")
    if not backgrounds:
        return ("nullptr", 0)

    output.append("constexpr gbs::PointClickBackgroundData point_click_backgrounds[] = {")
    for index, background in enumerate(backgrounds):
        if not isinstance(background, dict):
            raise SystemExit(f"point_click_project.backgrounds[{index}] precisa ser objeto")
        tilemap = background.get("tilemap", background.get("tilemap_asset"))
        if not isinstance(tilemap, str) or not tilemap:
            raise SystemExit(f"point_click_project.backgrounds[{index}].tilemap precisa ser string")
        tilemap_symbol = resolve_project_asset_symbol(
            tilemap,
            "tilemap",
            asset_report,
            f"point_click_project.backgrounds[{index}].tilemap",
        )
        layer = background_layer_from_json(background.get("layer", "bg1"))
        output.append(
            "    gbs::PointClickBackgroundData { "
            f"{cpp_string_literal(background.get('name', f'background_{index}'))}, "
            f"gbs::BackgroundLayer::{layer}, "
            f"{tilemap_symbol}, "
            f"static_cast<uint16_t>({int(background.get('backdrop_color', 0))}) "
            "},"
        )
    output.append("};")
    output.append("")
    return ("point_click_backgrounds", len(backgrounds))


def point_click_item_index_from_json(value, items, context):
    if value is None:
        return -1
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value:
        for index, item in enumerate(items):
            if not isinstance(item, dict):
                continue
            if value in (item.get("id"), item.get("name")):
                return index
        raise SystemExit(f"{context} referencia item inexistente: {value}")
    raise SystemExit(f"{context} precisa ser numero ou string")


def emit_point_click_inventory_items(output, point_click_project):
    items = point_click_project.get("inventory_items", point_click_project.get("items", point_click_project.get("inventory", [])))
    if items is None:
        items = []
    if not isinstance(items, list):
        raise SystemExit("point_click_project.inventory_items precisa ser lista")
    if not items:
        return ("nullptr", 0, items)

    output.append("constexpr gbs::PointClickInventoryItemData point_click_inventory_items[] = {")
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise SystemExit(f"point_click_project.inventory_items[{index}] precisa ser objeto")
        name = item.get("name", item.get("id", f"item_{index}"))
        if not isinstance(name, str) or not name:
            raise SystemExit(f"point_click_project.inventory_items[{index}].name precisa ser string")
        variable = int(item.get("variable", item.get("variable_index", index)))
        dialogue_line = int(item.get("line", item.get("dialogue_line", item.get("dialogue_line_index", -1))))
        output.append(
            "    gbs::PointClickInventoryItemData { "
            f"{cpp_string_literal(name)}, "
            f"{variable}, "
            f"{dialogue_line} "
            "},"
        )
    output.append("};")
    output.append("")
    return ("point_click_inventory_items", len(items), items)


def emit_point_click_hotspots(output, scene, scene_index, inventory_items):
    hotspots = scene.get("hotspots", scene.get("interactions", []))
    if hotspots is None:
        hotspots = []
    if not isinstance(hotspots, list):
        raise SystemExit(f"point_click_project.scenes[{scene_index}].hotspots precisa ser lista")
    if not hotspots:
        return ("nullptr", 0)

    hotspot_entries = []
    for hotspot_index, hotspot in enumerate(hotspots):
        if not isinstance(hotspot, dict):
            raise SystemExit(f"point_click_project.scenes[{scene_index}].hotspots[{hotspot_index}] precisa ser objeto")
        area = rect_from_json(
            hotspot.get("area"),
            f"point_click_project.scenes[{scene_index}].hotspots[{hotspot_index}].area",
        )
        on_click = emit_event_script(
            output,
            f"point_click_scene_{scene_index}_hotspot_{hotspot_index}_on_click",
            hotspot.get("on_click", hotspot.get("script")),
            f"point_click_project.scenes[{scene_index}].hotspots[{hotspot_index}].on_click",
        )
        resource_group = hotspot.get("resource_bank_group", hotspot.get("bank_group"))
        resource_group_expr = cpp_string_literal(resource_group) if isinstance(resource_group, str) and resource_group else "nullptr"
        on_use_item = emit_event_script(
            output,
            f"point_click_scene_{scene_index}_hotspot_{hotspot_index}_on_use_item",
            hotspot.get("on_use_item", hotspot.get("use_item_script")),
            f"point_click_project.scenes[{scene_index}].hotspots[{hotspot_index}].on_use_item",
        )
        required_item = point_click_item_index_from_json(
            hotspot.get("required_item", hotspot.get("requires_item", hotspot.get("required_item_index"))),
            inventory_items,
            f"point_click_project.scenes[{scene_index}].hotspots[{hotspot_index}].required_item",
        )
        give_item = point_click_item_index_from_json(
            hotspot.get("give_item", hotspot.get("grants_item", hotspot.get("give_item_index"))),
            inventory_items,
            f"point_click_project.scenes[{scene_index}].hotspots[{hotspot_index}].give_item",
        )
        hotspot_entries.append(
            "    gbs::PointClickHotspotData { "
            f"{cpp_string_literal(hotspot.get('name', f'hotspot_{hotspot_index}'))}, "
            f"gbs::Rect {{ {area[0]}, {area[1]}, {area[2]}, {area[3]} }}, "
            f"{int(hotspot.get('line', hotspot.get('dialogue_line', hotspot.get('dialogue_line_index', -1))))}, "
            f"{on_click}, "
            f"{int(hotspot.get('target_scene', hotspot.get('target_scene_index', -1)))}, "
            f"{resource_group_expr} "
            f", {required_item}, "
            f"{give_item}, "
            f"{int(hotspot.get('unavailable_line', hotspot.get('unavailable_dialogue_line', hotspot.get('unavailable_dialogue_line_index', -1))))}, "
            f"{on_use_item} "
            "},"
        )

    hotspots_name = f"point_click_scene_{scene_index}_hotspots"
    output.append(f"constexpr gbs::PointClickHotspotData {hotspots_name}[] = {{")
    output.extend(hotspot_entries)
    output.append("};")
    output.append("")
    return (hotspots_name, len(hotspots))


def point_click_scene_background_indices(scene, scene_index):
    backgrounds = scene.get("backgrounds")
    if backgrounds is None:
        return (None, 0, int(scene.get("background", scene.get("background_index", -1))))
    if not isinstance(backgrounds, list) or len(backgrounds) > 3:
        raise SystemExit(
            f"point_click_project.scenes[{scene_index}].backgrounds precisa ter de 0 a 3 indices"
        )
    return (
        [
            require_int(
                value,
                f"point_click_project.scenes[{scene_index}].backgrounds[{index}]",
                -1,
                65535,
            )
            for index, value in enumerate(backgrounds)
        ],
        len(backgrounds),
        -1,
    )


def emit_point_click_props(output, scene, scene_index, asset_report, base_dir=None):
    props = scene.get("props", [])
    if props is None:
        props = []
    if not isinstance(props, list) or len(props) > 6:
        raise SystemExit(f"point_click_project.scenes[{scene_index}].props precisa ter de 0 a 6 props")
    if not props:
        return ("nullptr", 0)

    prop_entries = []
    for prop_index, prop in enumerate(props):
        description = f"point_click_project.scenes[{scene_index}].props[{prop_index}]"
        if not isinstance(prop, dict):
            raise SystemExit(f"{description} precisa ser objeto")
        name = prop.get("name", prop.get("id", f"prop_{prop_index}"))
        if not isinstance(name, str) or not name:
            raise SystemExit(f"{description}.name precisa ser string")
        metasprite = resolve_project_metasprite_symbol(
            prop.get("metasprite"),
            None,
            asset_report,
            f"{description}.metasprite",
        )
        if metasprite is None:
            raise SystemExit(f"{description}.metasprite precisa referenciar asset valido")
        position = vec2_from_json(
            prop.get("position", prop.get("position_pixels")),
            f"{description}.position",
        )
        visible_variable = require_int(
            prop.get("visible_variable", prop.get("visible_variable_index", -1)),
            f"{description}.visible_variable",
            -1,
            15,
        )
        visible_value = require_int(
            prop.get("visible_value", prop.get("visible_variable_value", 1)),
            f"{description}.visible_value",
            -2147483648,
            2147483647,
        )
        animation_entries = topdown_npc_animation_entries(
            output,
            f"point_click_scene_{scene_index}_prop_{prop_index}",
            prop,
            asset_report,
            description,
            base_dir,
        )
        animation_symbols = {
            animation_lookup_key(animation_name): symbol
            for animation_name, symbol in animation_entries
        }
        selected_animation = prop.get("animation")
        idle_animation = None
        if isinstance(selected_animation, str):
            idle_animation = animation_symbols.get(animation_lookup_key(selected_animation))
        elif selected_animation is not None:
            idle_animation = resolve_project_animation_symbol(
                selected_animation,
                asset_report,
                f"{description}.animation",
            )
        if idle_animation is None:
            idle_animation = animation_symbols.get("idle")
        if idle_animation is None and animation_entries:
            idle_animation = animation_entries[0][1]
        prop_entries.append(
            "    gbs::PointClickPropData { "
            f"{cpp_string_literal(name)}, &{metasprite}, "
            f"{'&' + idle_animation if idle_animation is not None else 'nullptr'}, "
            f"gbs::Vec2i {{ {position[0]}, {position[1]} }}, {visible_variable}, {visible_value} "
            "},"
        )

    props_name = f"point_click_scene_{scene_index}_props"
    output.append(f"constexpr gbs::PointClickPropData {props_name}[] = {{")
    output.extend(prop_entries)
    output.append("};")
    output.append("")
    return (props_name, len(props))


def emit_point_click_project_data_header(point_click_project, asset_report=None, base_dir=None):
    if not isinstance(point_click_project, dict):
        raise SystemExit("point_click_project precisa ser objeto")
    scenes = point_click_project.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        raise SystemExit("point_click_project.scenes precisa ser lista nao vazia")

    output = [
        "#pragma once",
        "#include <stddef.h>",
        "#include <stdint.h>",
        "#include \"gbs/point_click.hpp\"",
        "#include \"gbs/runtime_save_restore.hpp\"",
    ]
    for include in merge_includes(
        string_list_from_json(point_click_project.get("includes", []), "point_click_project.includes"),
        project_auto_includes(point_click_project, asset_report),
    ):
        output.append(f"#include {cpp_string_literal(include)}")
    output.extend([
        "",
        "namespace gbastudio_point_click_project {",
        "",
    ])

    save_config = save_config_from_json(point_click_project.get("save"), "point_click_project.save", "GBPC", 0)
    emit_save_config(output, save_config)

    asset_refs = emit_project_asset_references(output, point_click_project, "point_click_project", "point_click_project", include_audio=True, asset_report=asset_report)
    cursor_config = point_click_project.get("cursor")
    cursor_metasprite_expr = "nullptr"
    cursor_idle_animation_expr = "nullptr"
    cursor_hover_animation_expr = "nullptr"
    cursor_click_animation_expr = "nullptr"
    if cursor_config is not None:
        if not isinstance(cursor_config, dict):
            raise SystemExit("point_click_project.cursor precisa ser objeto")
        cursor_metasprite = resolve_project_metasprite_symbol(
            cursor_config.get("metasprite"),
            None,
            asset_report,
            "point_click_project.cursor.metasprite",
        )
        if cursor_metasprite is None:
            raise SystemExit("point_click_project.cursor.metasprite precisa referenciar asset valido")
        cursor_metasprite_expr = f"&{cursor_metasprite}"
        for entry in cursor_config.get("animations", []) or []:
            if isinstance(entry, dict) and animation_lookup_key(entry.get("name", "")) == "click" and entry.get("loops", True):
                raise SystemExit("point_click_project.cursor click animation cannot loop")
        cursor_animation_entries = topdown_npc_animation_entries(
            output,
            "point_click_cursor",
            cursor_config,
            asset_report,
            "point_click_project.cursor",
            base_dir,
        )
        cursor_animation_symbols = {
            animation_lookup_key(name): symbol
            for name, symbol in cursor_animation_entries
        }
        if cursor_animation_symbols.get("idle") is not None:
            cursor_idle_animation_expr = f"&{cursor_animation_symbols['idle']}"
        if cursor_animation_symbols.get("hover") is not None:
            cursor_hover_animation_expr = f"&{cursor_animation_symbols['hover']}"
        if cursor_animation_symbols.get("click") is not None:
            cursor_click_animation_expr = f"&{cursor_animation_symbols['click']}"
    backgrounds_name, project_background_count = emit_point_click_backgrounds(
        output,
        point_click_project,
        asset_report,
    )
    resource_banks_name, resource_bank_count, resource_bank_groups_name, resource_bank_group_count = emit_project_resource_banks(
        output,
        point_click_project,
        "point_click_project",
        asset_report,
    )
    emit_resource_bank_upload_sources(output, asset_report)

    dialogue_lines_name, dialogue_line_count = emit_dialogue_lines(
        output,
        point_click_project.get("dialogue_lines", []),
        "point_click_project.dialogue_lines",
    )

    project_script_entries = emit_topdown_project_scripts(output, point_click_project)
    project_scripts_name = "nullptr"
    project_script_count = 0
    if project_script_entries:
        project_scripts_name = "project_scripts"
        project_script_count = len(project_script_entries)
        output.append("constexpr gbs::EventScript project_scripts[] = {")
        for script_expr in project_script_entries:
            output.append(f"    {script_expr},")
        output.append("};")
        output.append("")

    inventory_items_name, inventory_item_count, inventory_items = emit_point_click_inventory_items(output, point_click_project)

    scene_entries = []
    for scene_index, scene in enumerate(scenes):
        if not isinstance(scene, dict):
            raise SystemExit(f"point_click_project.scenes[{scene_index}] precisa ser objeto")
        hotspots_name, hotspot_count = emit_point_click_hotspots(output, scene, scene_index, inventory_items)
        background_indices, scene_background_count, background_index = point_click_scene_background_indices(
            scene,
            scene_index,
        )
        if background_indices is None:
            background_indices_name = "nullptr"
        else:
            background_indices_name = f"point_click_scene_{scene_index}_backgrounds"
            output.append(
                f"constexpr int {background_indices_name}[] = {{ {', '.join(str(index) for index in background_indices)} }};"
            )
            output.append("")
        props_name, prop_count = emit_point_click_props(output, scene, scene_index, asset_report, base_dir)
        on_enter = emit_event_script(
            output,
            f"point_click_scene_{scene_index}_on_enter",
            scene.get("on_enter"),
            f"point_click_project.scenes[{scene_index}].on_enter",
        )
        on_exit = emit_event_script(
            output,
            f"point_click_scene_{scene_index}_on_exit",
            scene.get("on_exit"),
            f"point_click_project.scenes[{scene_index}].on_exit",
        )
        resource_group = scene.get("resource_bank_group", scene.get("bank_group"))
        resource_group_expr = cpp_string_literal(resource_group) if isinstance(resource_group, str) and resource_group else "nullptr"
        scene_entries.append(
            "    gbs::PointClickSceneData { "
            f"{cpp_string_literal(scene.get('name', f'scene_{scene_index}'))}, "
            f"{background_index}, "
            f"{hotspots_name}, "
            f"{hotspot_count}, "
            f"{on_enter}, "
            f"{on_exit}, "
            f"{resource_group_expr}, "
            f"{int(scene.get('cursor_speed', scene.get('cursor_speed_pixels', 0)))}, "
            f"{background_indices_name}, "
            f"{scene_background_count}, "
            f"{props_name}, "
            f"{prop_count} "
            "},"
        )
    output.append("constexpr gbs::PointClickSceneData scenes[] = {")
    output.extend(scene_entries)
    output.append("};")
    output.append("")

    cursor = vec2_from_json(
        point_click_project.get("cursor_start", point_click_project.get("cursor_start_pixels", {"x": 120, "y": 80})),
        "point_click_project.cursor_start",
    )
    output.extend([
        "const gbs::PointClickProjectData project {",
        f"    {asset_refs['bg_palettes'][0]},",
        f"    {asset_refs['bg_palettes'][1]},",
        f"    {asset_refs['tile_assets'][0]},",
        f"    {asset_refs['tile_assets'][1]},",
        f"    {backgrounds_name},",
        f"    {project_background_count},",
        "    scenes,",
        f"    {len(scenes)},",
        f"    {int(point_click_project.get('initial_scene', 0))},",
        f"    gbs::Vec2i {{ {cursor[0]}, {cursor[1]} }},",
        f"    {int(point_click_project.get('cursor_speed', point_click_project.get('cursor_speed_pixels', 2)))},",
        f"    {dialogue_lines_name},",
        f"    {dialogue_line_count},",
        f"    {project_scripts_name},",
        f"    {project_script_count},",
        f"    {resource_banks_name},",
        f"    {resource_bank_count},",
        f"    {resource_bank_groups_name},",
        f"    {resource_bank_group_count},",
        f"    {inventory_items_name},",
        f"    {inventory_item_count},",
        f"    {asset_refs['sfx_assets'][0]},",
        f"    {asset_refs['sfx_assets'][1]},",
        f"    {asset_refs['music_assets'][0]},",
        f"    {asset_refs['music_assets'][1]},",
        f"    {asset_refs['pcm_assets'][0]},",
        f"    {asset_refs['pcm_assets'][1]},",
        f"    {asset_refs['tracker_assets'][0]},",
        f"    {asset_refs['tracker_assets'][1]},",
        f"    {cursor_metasprite_expr},",
        f"    {cursor_idle_animation_expr},",
        f"    {cursor_hover_animation_expr},",
        f"    {asset_refs['obj_palettes'][0]},",
        f"    {asset_refs['obj_palettes'][1]},",
        f"    {cursor_click_animation_expr},",
        "};",
        "",
        "} // namespace gbastudio_point_click_project",
        "",
    ])
    return "\n".join(output)


def emit_menu_backgrounds(output, menu_project, asset_report=None):
    backgrounds = menu_project.get("backgrounds", [])
    if backgrounds is None:
        backgrounds = []
    if not isinstance(backgrounds, list):
        raise SystemExit("menu_project.backgrounds precisa ser lista")
    if not backgrounds:
        return ("nullptr", 0)

    output.append("constexpr gbs::MenuBackgroundData menu_backgrounds[] = {")
    for index, background in enumerate(backgrounds):
        if not isinstance(background, dict):
            raise SystemExit(f"menu_project.backgrounds[{index}] precisa ser objeto")
        tilemap = background.get("tilemap", background.get("tilemap_asset"))
        if not isinstance(tilemap, str) or not tilemap:
            raise SystemExit(f"menu_project.backgrounds[{index}].tilemap precisa ser string")
        tilemap_symbol = resolve_project_asset_symbol(
            tilemap,
            "tilemap",
            asset_report,
            f"menu_project.backgrounds[{index}].tilemap",
        )
        layer = background_layer_from_json(background.get("layer", "bg1"))
        output.append(
            "    gbs::MenuBackgroundData { "
            f"{cpp_string_literal(background.get('name', f'background_{index}'))}, "
            f"gbs::BackgroundLayer::{layer}, "
            f"{tilemap_symbol}, "
            f"static_cast<uint16_t>({int(background.get('backdrop_color', 0))}) "
            "},"
        )
    output.append("};")
    output.append("")
    return ("menu_backgrounds", len(backgrounds))


def menu_item_action_from_json(item, item_path):
    raw_action = item.get("action", item.get("kind", item.get("type")))
    if raw_action is None:
        if "push_screen" in item:
            raw_action = "push_screen"
        elif "pop_screen" in item or bool(item.get("back", False)):
            raw_action = "pop_screen"
        elif "toggle_variable" in item:
            raw_action = "toggle_variable"
        elif "adjust_variable" in item:
            raw_action = "adjust_variable"
        elif item.get("target_screen", item.get("target_screen_index", -1)) is not None:
            raw_action = "select"
        else:
            raw_action = "select"
    if not isinstance(raw_action, str):
        raise SystemExit(f"{item_path}.action precisa ser string")
    normalized = raw_action.strip().lower().replace("-", "_")
    action_map = {
        "select": "Select",
        "script": "Select",
        "open": "OpenScreen",
        "open_screen": "OpenScreen",
        "target_screen": "OpenScreen",
        "push": "PushScreen",
        "push_screen": "PushScreen",
        "submenu": "PushScreen",
        "pop": "PopScreen",
        "pop_screen": "PopScreen",
        "back": "PopScreen",
        "toggle": "ToggleVariable",
        "toggle_variable": "ToggleVariable",
        "adjust": "AdjustVariable",
        "adjust_variable": "AdjustVariable",
        "slider": "AdjustVariable",
    }
    if normalized not in action_map:
        raise SystemExit(f"{item_path}.action invalido: {raw_action}")
    return action_map[normalized]


def menu_item_condition_from_json(item):
    condition = item.get("condition", {})
    if condition is None:
        condition = {}
    if not isinstance(condition, dict):
        raise SystemExit("menu item condition precisa ser objeto")
    variable = condition.get(
        "variable",
        condition.get(
            "variable_index",
            item.get("required_variable", item.get("required_variable_index", -1)),
        ),
    )
    value = condition.get("value", condition.get("equals", item.get("required_value", 1)))
    hide = condition.get(
        "hide_when_unavailable",
        condition.get("hide", item.get("hide_when_unavailable", False)),
    )
    return (int(variable), int(value), bool(hide))


def menu_item_value_from_json(item, action):
    value = item.get("value", {})
    if value is None:
        value = {}
    if not isinstance(value, dict):
        value = {"variable": value}
    toggle_variable = item.get("toggle_variable")
    adjust_variable = item.get("adjust_variable")
    variable = value.get("variable", value.get("variable_index", -1))
    if toggle_variable is not None:
        variable = toggle_variable
    if adjust_variable is not None:
        variable = adjust_variable
    if action not in ("ToggleVariable", "AdjustVariable") and int(variable) < 0:
        return (-1, 0, 0, 0)
    minimum = value.get("min", item.get("min", 0))
    maximum = value.get("max", item.get("max", 1 if action == "ToggleVariable" else 10))
    step = value.get("step", item.get("step", 1))
    return (int(variable), int(minimum), int(maximum), int(step))


def menu_audio_channel_from_json(item, item_path):
    value = item.get("audio_channel", item.get("audioChannel", ""))
    if value in (None, ""):
        return -1
    normalized = str(value).strip().lower().replace("-", "_")
    channels = {"music": 0, "sfx": 1, "pcm_music": 2, "pcm_sfx": 3, "all": 4}
    if normalized not in channels:
        raise SystemExit(f"{item_path}.audio_channel invalido: {value}")
    return channels[normalized]


def menu_item_binding_from_json(item, item_path):
    binding = item.get("binding")
    if binding in (None, ""):
        return ("None", -1, "Number")
    if not isinstance(binding, dict):
        raise SystemExit(f"{item_path}.binding precisa ser objeto")
    source = str(binding.get("source", "")).strip().lower().replace("-", "_")
    source_map = {
        "variable": ("Variable", 64),
        "inventory": ("Inventory", 16),
        "stat": ("Stat", 8),
        "equipped": ("Equipped", 8),
    }
    if source not in source_map:
        raise SystemExit(f"{item_path}.binding.source invalido: {source}")
    source_name, limit = source_map[source]
    index = int(binding.get("index", -1))
    if index < 0 or index >= limit:
        raise SystemExit(f"{item_path}.binding.index invalido para {source}")
    raw_format = str(binding.get("format", "number")).strip().lower().replace("-", "_")
    format_map = {
        "number": "Number",
        "count": "Count",
        "percent": "Percent",
        "on_off": "OnOff",
        "onoff": "OnOff",
    }
    if raw_format not in format_map:
        raise SystemExit(f"{item_path}.binding.format invalido: {raw_format}")
    return (source_name, index, format_map[raw_format])


def emit_menu_items(output, screen, screen_index):
    items = screen.get("items", screen.get("options", []))
    if items is None:
        items = []
    if not isinstance(items, list):
        raise SystemExit(f"menu_project.screens[{screen_index}].items precisa ser lista")
    if not items:
        screen_type = str(screen.get("screen_type", "menu")).strip().lower()
        if screen_type != "logo":
            raise SystemExit(f"menu_project.screens[{screen_index}].items precisa ser lista nao vazia")
        return ("nullptr", 0)

    item_entries = []
    for item_index, item in enumerate(items):
        if not isinstance(item, dict):
            raise SystemExit(f"menu_project.screens[{screen_index}].items[{item_index}] precisa ser objeto")
        item_path = f"menu_project.screens[{screen_index}].items[{item_index}]"
        on_select = emit_event_script(
            output,
            f"menu_screen_{screen_index}_item_{item_index}_on_select",
            item.get("on_select", item.get("script")),
            f"{item_path}.on_select",
        )
        action = menu_item_action_from_json(item, item_path)
        condition_variable, condition_value, condition_hide = menu_item_condition_from_json(item)
        value_variable, value_min, value_max, value_step = menu_item_value_from_json(item, action)
        click_box = item.get("click_box", {})
        if click_box is None:
            click_box = {}
        if not isinstance(click_box, dict):
            raise SystemExit(f"{item_path}.click_box precisa ser objeto")
        click_x = int(click_box.get("x", 0))
        click_y = int(click_box.get("y", 0))
        click_width = int(click_box.get("width", 240))
        click_height = int(click_box.get("height", 160))
        if click_x < 0 or click_y < 0 or click_width <= 0 or click_height <= 0 or click_x + click_width > 240 or click_y + click_height > 160:
            raise SystemExit(f"{item_path}.click_box precisa caber no viewport 240x160")
        checked_value = int(item.get("checked_value", value_max if action == "ToggleVariable" else 0))
        audio_channel = menu_audio_channel_from_json(item, item_path)
        binding_source, binding_index, binding_format = menu_item_binding_from_json(item, item_path)
        target_screen = int(item.get("target_screen", item.get("target_screen_index", item.get("push_screen", -1))))
        if action == "PopScreen":
            target_screen = -1
        target_item = int(item.get("target_item", -1))
        if target_item < -1 or (target_item >= 0 and (action not in ("OpenScreen", "PushScreen") or target_screen < 0)):
            raise SystemExit(f"{item_path}.target_item requer destino de menu valido")
        save_slot = int(item.get("save_slot", -1))
        if save_slot < -1 or save_slot >= 8:
            raise SystemExit(f"{item_path}.save_slot invalido")
        value_labels = item.get("value_labels", [])
        if not isinstance(value_labels, list) or len(value_labels) > 16 or any(not isinstance(label, str) for label in value_labels):
            raise SystemExit(f"{item_path}.value_labels invalido")
        detail_lines = item.get("detail_lines", [])
        if not isinstance(detail_lines, list) or len(detail_lines) > 3 or any(not isinstance(line, str) for line in detail_lines):
            raise SystemExit(f"{item_path}.detail_lines invalido")
        detail_lines = detail_lines + [None] * (3 - len(detail_lines))
        detail_expr = ", ".join(cpp_string_literal(line) if line is not None else "nullptr" for line in detail_lines)
        labels_symbol = "nullptr"
        if value_labels:
            labels_symbol = f"menu_screen_{screen_index}_item_{item_index}_value_labels"
            output.append(f"constexpr const char* {labels_symbol}[] = {{ " + ", ".join(cpp_string_literal(label) for label in value_labels) + " };")
        item_entries.append(
            "    gbs::MenuItemData { "
            f"{cpp_string_literal(item.get('label', item.get('name', f'item_{item_index}')))}, "
            f"{int(item.get('line', item.get('dialogue_line', item.get('dialogue_line_index', -1))))}, "
            f"{on_select}, "
            f"{target_screen}, "
            f"{'true' if bool(item.get('enabled', True)) else 'false'}, "
            f"gbs::MenuItemAction::{action}, "
            f"gbs::MenuItemConditionData {{ {condition_variable}, {condition_value}, {'true' if condition_hide else 'false'} }}, "
            f"gbs::MenuItemValueData {{ {value_variable}, {value_min}, {value_max}, {value_step} }}, "
            f"gbs::MenuClickBox {{ {click_x}, {click_y}, {click_width}, {click_height} }}, "
            f"{checked_value}, "
            f"{'true' if bool(item.get('requires_save', item.get('requiresSave', False))) else 'false'}, "
            f"{audio_channel}, "
            f"gbs::MenuItemBindingData {{ gbs::MenuItemBindingSource::{binding_source}, {binding_index}, gbs::MenuItemBindingFormat::{binding_format} }}, "
            f"{target_item}, {save_slot}, {labels_symbol}, {len(value_labels)}, {{ {detail_expr} }} "
            "},"
        )

    items_name = f"menu_screen_{screen_index}_items"
    output.append(f"constexpr gbs::MenuItemData {items_name}[] = {{")
    output.extend(item_entries)
    output.append("};")
    output.append("")
    return (items_name, len(items))


def emit_menu_actors(output, screen, screen_index, asset_report=None):
    actors = screen.get("actors", [])
    if actors is None:
        actors = []
    if not isinstance(actors, list):
        raise SystemExit(f"menu_project.screens[{screen_index}].actors precisa ser lista")
    if not actors:
        return ("nullptr", 0)

    actor_entries = []
    for actor_index, actor in enumerate(actors):
        description = f"menu_project.screens[{screen_index}].actors[{actor_index}]"
        if not isinstance(actor, dict):
            raise SystemExit(f"{description} precisa ser objeto")
        name = actor.get("name", f"actor_{actor_index}")
        if not isinstance(name, str) or not name:
            raise SystemExit(f"{description}.name precisa ser string")
        metasprite = resolve_project_metasprite_symbol(
            actor.get("metasprite"),
            None,
            asset_report,
            f"{description}.metasprite",
        )
        if metasprite is None:
            raise SystemExit(f"{description}.metasprite precisa referenciar asset valido")
        metasprite_asset = actor.get("metasprite")
        selected_metasprite = resolve_project_metasprite_symbol(
            actor.get("selected_metasprite", actor.get("selectedMetasprite")),
            None,
            asset_report,
            f"{description}.selected_metasprite",
        )
        if actor.get("selected_metasprite", actor.get("selectedMetasprite")) is not None and selected_metasprite is None:
            raise SystemExit(f"{description}.selected_metasprite precisa referenciar asset valido")
        tile_asset = resolve_menu_actor_asset_symbol(metasprite_asset, "tile_assets", asset_report)
        palette_asset = resolve_menu_actor_asset_symbol(metasprite_asset, "obj_palettes", asset_report)
        position = vec2_from_json(
            actor.get("position", {"x": actor.get("x", 0), "y": actor.get("y", 0)}),
            f"{description}.position",
        )
        entry_animation = str(actor.get("entry_animation", actor.get("entryAnimation", "none"))).strip().lower().replace("-", "_")
        entry_animation_map = {"none": "None", "slide_down": "SlideDown"}
        if entry_animation not in entry_animation_map:
            raise SystemExit(f"{description}.entry_animation invalido: {entry_animation}")
        entry_offset_y = max(0, min(160, int(actor.get("entry_offset_y", actor.get("entryOffsetY", 0)))))
        entry_animation_frames = max(0, min(3600, int(actor.get("entry_animation_frames", actor.get("entryAnimationFrames", 0)))))
        role = str(actor.get("role", "decorative")).strip().lower().replace("-", "_")
        role_map = {"decorative": "Decorative", "option": "Option", "cursor": "Cursor"}
        if role not in role_map:
            raise SystemExit(f"{description}.role invalido: {role}")
        menu_item_index = int(actor.get("menu_item_index", actor.get("menuItemIndex", -1)))
        cursor_for_menu = actor.get("cursor_for_menu", actor.get("cursorForMenu"))
        if cursor_for_menu is not None and not isinstance(cursor_for_menu, str):
            raise SystemExit(f"{description}.cursor_for_menu precisa ser string")
        visibility_variable = int(actor.get("visibility_variable", actor.get("visibilityVariable", -1)))
        visibility_value = int(actor.get("visibility_value", actor.get("visibilityValue", -1)))
        if visibility_variable < -1 or visibility_variable >= 64 or (visibility_variable >= 0 and visibility_value < 0):
            raise SystemExit(f"{description}.visibility_variable/visibility_value invalido")
        visibility_expr = f", {visibility_variable}, {visibility_value}" if visibility_variable >= 0 else ", -1, -1"
        on_init = emit_event_script(
            output,
            f"menu_screen_{screen_index}_actor_{actor_index}_on_init",
            actor.get("on_init", actor.get("onStart")),
            f"{description}.on_init",
        )
        on_interact = emit_event_script(
            output,
            f"menu_screen_{screen_index}_actor_{actor_index}_on_interact",
            actor.get("on_interact", actor.get("onInteract")),
            f"{description}.on_interact",
        )
        on_update = emit_event_script(
            output,
            f"menu_screen_{screen_index}_actor_{actor_index}_on_update",
            actor.get("on_update", actor.get("onUpdate")),
            f"{description}.on_update",
        )
        cursor_offset = vec2_from_json(actor.get("cursor_offset_pixels", {"x": 0, "y": 0}), description + ".cursor_offset_pixels")
        actor_entries.append(
            "    gbs::MenuActorData { "
            f"{cpp_string_literal(name)}, &{metasprite}, "
            f"gbs::Vec2i {{ {position[0]}, {position[1]} }}, "
            f"gbs::MenuActorEntryAnimation::{entry_animation_map[entry_animation]}, "
            f"{entry_offset_y}, {entry_animation_frames}, "
            f"gbs::MenuActorRole::{role_map[role]}, {menu_item_index}, "
            f"{cpp_string_literal(cursor_for_menu) if cursor_for_menu else 'nullptr'}, "
            f"{f'&{tile_asset}' if tile_asset else 'nullptr'}, "
            f"{f'&{palette_asset}' if palette_asset else 'nullptr'}"
            f"{visibility_expr}, "
            f"{f'&{selected_metasprite}' if selected_metasprite else 'nullptr'}, "
            f"{on_init}, {on_interact}, {on_update}, "
            f"{'true' if actor.get('flip_horizontal', False) else 'false'}, "
            f"{'true' if actor.get('cursor_follows_option', False) else 'false'}, "
            f"gbs::Vec2i {{ {cursor_offset[0]}, {cursor_offset[1]} }}, "
            f"{'true' if actor.get('selected_only', False) else 'false'} "
            "},"
        )

    actors_name = f"menu_screen_{screen_index}_actors"
    output.append(f"constexpr gbs::MenuActorData {actors_name}[] = {{")
    output.extend(actor_entries)
    output.append("};")
    output.append("")
    return (actors_name, len(actor_entries))


def emit_menu_project_data_header(menu_project, asset_report=None):
    if not isinstance(menu_project, dict):
        raise SystemExit("menu_project precisa ser objeto")
    screens = menu_project.get("screens", menu_project.get("menus"))
    if not isinstance(screens, list) or not screens:
        raise SystemExit("menu_project.screens precisa ser lista nao vazia")

    output = [
        "#pragma once",
        "#include <stddef.h>",
        "#include <stdint.h>",
        "#include \"gbs/menu.hpp\"",
        "#include \"gbs/runtime_save_restore.hpp\"",
    ]
    for include in merge_includes(
        string_list_from_json(menu_project.get("includes", []), "menu_project.includes"),
        project_auto_includes(menu_project, asset_report),
    ):
        output.append(f"#include {cpp_string_literal(include)}")
    output.extend([
        "",
        "namespace gbastudio_menu_project {",
        "",
    ])

    save_config = save_config_from_json(menu_project.get("save"), "menu_project.save", "GBMN", 0)
    emit_save_config(output, save_config)

    asset_refs = emit_project_asset_references(output, menu_project, "menu_project", "menu_project", include_audio=True, asset_report=asset_report)
    backgrounds_name, background_count = emit_menu_backgrounds(output, menu_project, asset_report)
    resource_banks_name, resource_bank_count, resource_bank_groups_name, resource_bank_group_count = emit_project_resource_banks(
        output,
        menu_project,
        "menu_project",
        asset_report,
    )

    dialogue_lines_name, dialogue_line_count = emit_dialogue_lines(
        output,
        menu_project.get("dialogue_lines", []),
        "menu_project.dialogue_lines",
    )

    screen_entries = []
    for screen_index, screen in enumerate(screens):
        if not isinstance(screen, dict):
            raise SystemExit(f"menu_project.screens[{screen_index}] precisa ser objeto")
        items_name, item_count = emit_menu_items(output, screen, screen_index)
        actors_name, actor_count = emit_menu_actors(output, screen, screen_index, asset_report)
        on_enter = emit_event_script(
            output,
            f"menu_screen_{screen_index}_on_enter",
            screen.get("on_enter"),
            f"menu_project.screens[{screen_index}].on_enter",
        )
        on_exit = emit_event_script(
            output,
            f"menu_screen_{screen_index}_on_exit",
            screen.get("on_exit"),
            f"menu_project.screens[{screen_index}].on_exit",
        )
        on_back = emit_event_script(
            output,
            f"menu_screen_{screen_index}_on_back",
            screen.get("on_back"),
            f"menu_project.screens[{screen_index}].on_back",
        )
        background_index = int(screen.get("background", screen.get("background_index", -1)))
        title_line_index = int(screen.get("title_line", screen.get("title_line_index", -1)))
        resource_group = screen.get("resource_bank_group", screen.get("bank_group"))
        resource_group_expr = cpp_string_literal(resource_group) if isinstance(resource_group, str) and resource_group else "nullptr"
        screen_type = str(screen.get("screen_type", "menu")).strip().lower().replace("-", "_")
        screen_type_map = {"logo": "Logo", "title": "Title", "title_screen": "Title", "menu": "Menu"}
        if screen_type not in screen_type_map:
            raise SystemExit(f"menu_project.screens[{screen_index}].screen_type invalido: {screen_type}")
        screen_title = screen.get("title")
        screen_title_expr = cpp_string_literal(screen_title) if isinstance(screen_title, str) and screen_title else "nullptr"
        auto_advance_frames = int(screen.get("auto_advance_frames", 0))
        allow_skip = bool(screen.get("allow_skip", False))
        next_screen = int(screen.get("next_screen", screen.get("next_screen_index", -1)))
        title_overlay_background = int(screen.get(
            "title_overlay_background",
            screen.get("title_overlay_background_index", -1),
        ))
        title_fade_frames = max(0, min(3600, int(screen.get("title_fade_frames", 0))))
        text_input = screen.get("text_input", screen.get("textInput"))
        if text_input is None:
            text_input_expr = "gbs::menu_no_text_input()"
        else:
            if not isinstance(text_input, dict):
                raise SystemExit(f"menu_project.screens[{screen_index}].text_input precisa ser objeto")
            variable_index = int(text_input.get("variable_index", text_input.get("variableIndex", -1)))
            max_length = int(text_input.get("max_length", text_input.get("maxLength", 0)))
            input_x = int(text_input.get("x", 0))
            input_y = int(text_input.get("y", 0))
            input_width = int(text_input.get("width", 0))
            if variable_index < 0 or max_length <= 0 or max_length > 16 or input_x < 0 or input_y < 0 or input_width <= 0 or input_x + input_width > 32 or max_length > input_width:
                raise SystemExit(f"menu_project.screens[{screen_index}].text_input invalido")
            raw_keyboard = text_input.get("keyboard", {})
            if raw_keyboard is None:
                raw_keyboard = {}
            if not isinstance(raw_keyboard, dict):
                raise SystemExit(f"menu_project.screens[{screen_index}].text_input.keyboard precisa ser objeto")
            keyboard_layout = raw_keyboard.get("layout", text_input.get("keyboard_layout", "hidden"))
            if keyboard_layout in (1, "1", "grid", "GRID"):
                keyboard_layout_name = "Grid"
                keyboard_x = int(raw_keyboard.get("x", text_input.get("keyboard_x", 4)))
                keyboard_y = int(raw_keyboard.get("y", text_input.get("keyboard_y", 8)))
                keyboard_width = int(raw_keyboard.get("width", text_input.get("keyboard_width", 22)))
                keyboard_height = int(raw_keyboard.get("height", text_input.get("keyboard_height", 6)))
                keyboard_allow_lowercase = bool(raw_keyboard.get(
                    "allowLowercase",
                    raw_keyboard.get("allow_lowercase", text_input.get("keyboard_allow_lowercase", True)),
                ))
                keyboard_control_layout = str(raw_keyboard.get(
                    "controlLayout",
                    raw_keyboard.get("control_layout", text_input.get("keyboard_control_layout", "bottom")),
                )).strip().lower()
                if keyboard_control_layout not in ("bottom", "side", "bottom_grid"):
                    raise SystemExit(f"menu_project.screens[{screen_index}].text_input.keyboard.control_layout invalido")
                keyboard_controls_x = int(raw_keyboard.get("controlsX", raw_keyboard.get("controls_x", text_input.get("keyboard_controls_x", 0))))
                keyboard_controls_y = int(raw_keyboard.get("controlsY", raw_keyboard.get("controls_y", text_input.get("keyboard_controls_y", 0))))
                keyboard_controls_width = int(raw_keyboard.get("controlsWidth", raw_keyboard.get("controls_width", text_input.get("keyboard_controls_width", 0))))
                keyboard_controls_height = int(raw_keyboard.get("controlsHeight", raw_keyboard.get("controls_height", text_input.get("keyboard_controls_height", 0))))
                keyboard_surface = str(raw_keyboard.get(
                    "surface",
                    raw_keyboard.get("keyboard_surface", text_input.get("keyboard_surface", "runtime")),
                )).strip().lower()
                if keyboard_surface not in ("runtime", "background"):
                    raise SystemExit(f"menu_project.screens[{screen_index}].text_input.keyboard.surface invalido")
                keyboard_surface_suffix = (
                    ", gbs::MenuTextInputKeyboardSurface::Background"
                    if keyboard_surface == "background"
                    else ""
                )
                if (
                    keyboard_x < 0 or keyboard_y < 0 or
                    keyboard_width < (16 if keyboard_control_layout == "bottom_grid" else 22) or
                    keyboard_height < (10 if keyboard_control_layout == "bottom_grid" else 6) or
                    keyboard_x + keyboard_width > 32 or keyboard_y + keyboard_height > 20
                ):
                    raise SystemExit(f"menu_project.screens[{screen_index}].text_input.keyboard invalido")
                if keyboard_control_layout == "side" and (
                    keyboard_controls_x < keyboard_x + keyboard_width or
                    keyboard_controls_y < keyboard_y or
                    keyboard_controls_width < 5 or keyboard_controls_height < 6 or
                    keyboard_controls_x + keyboard_controls_width > 32 or
                    keyboard_controls_y + keyboard_controls_height > 20
                ):
                    raise SystemExit(f"menu_project.screens[{screen_index}].text_input.keyboard.side_controls invalido")
                if keyboard_control_layout in ("side", "bottom_grid"):
                    keyboard_expr = (
                        "gbs::MenuTextInputKeyboardData { "
                        f"gbs::MenuTextInputKeyboardLayout::{keyboard_layout_name}, "
                        f"{keyboard_x}, {keyboard_y}, {keyboard_width}, {keyboard_height}, "
                        f"{'true' if keyboard_allow_lowercase else 'false'}, "
                        f"gbs::MenuTextInputKeyboardControlLayout::{'Side' if keyboard_control_layout == 'side' else 'BottomGrid'}, "
                        f"{keyboard_controls_x}, {keyboard_controls_y}, {keyboard_controls_width}, {keyboard_controls_height}"
                        f"{keyboard_surface_suffix} "
                        "}"
                    )
                else:
                    keyboard_expr = (
                        "gbs::MenuTextInputKeyboardData { "
                        f"gbs::MenuTextInputKeyboardLayout::{keyboard_layout_name}, "
                        f"{keyboard_x}, {keyboard_y}, {keyboard_width}, {keyboard_height}, "
                        f"{'true' if keyboard_allow_lowercase else 'false'}"
                        f"{keyboard_surface_suffix} "
                        "}"
                    )
            elif keyboard_layout in (0, "0", "hidden", "HIDDEN", None, ""):
                keyboard_expr = "gbs::menu_no_text_input_keyboard()"
            else:
                raise SystemExit(f"menu_project.screens[{screen_index}].text_input.keyboard.layout invalido")
            text_input_expr = (
                f"gbs::MenuTextInputData {{ {variable_index}, {max_length}, {input_x}, {input_y}, {input_width}, "
                f"{keyboard_expr} }}"
            )
        background_animation = screen.get("background_animation", screen.get("backgroundAnimation"))
        background_animation_expr = "nullptr"
        background_animation_count = 0
        background_animation_duration = 0
        background_animation_loop = True
        if background_animation is not None:
            if not isinstance(background_animation, dict):
                raise SystemExit(f"menu_project.screens[{screen_index}].background_animation precisa ser objeto")
            frames = background_animation.get("frames", background_animation.get("frame_indexes", []))
            if not isinstance(frames, list) or len(frames) < 2:
                raise SystemExit(f"menu_project.screens[{screen_index}].background_animation.frames precisa ter pelo menos 2 itens")
            normalized_frames = [int(frame) for frame in frames]
            if any(frame < 0 or frame >= background_count for frame in normalized_frames):
                raise SystemExit(f"menu_project.screens[{screen_index}].background_animation.frames contem background invalido")
            background_animation_duration = int(background_animation.get(
                "frame_duration",
                background_animation.get("frameDuration", 0),
            ))
            if background_animation_duration <= 0:
                raise SystemExit(f"menu_project.screens[{screen_index}].background_animation.frame_duration precisa ser positivo")
            background_animation_loop = bool(background_animation.get("loop", True))
            background_animation_name = f"menu_screen_{screen_index}_background_animation_frames"
            output.append(
                f"constexpr int {background_animation_name}[] = {{ "
                + ", ".join(str(frame) for frame in normalized_frames)
                + " };"
            )
            output.append("")
            background_animation_expr = background_animation_name
            background_animation_count = len(normalized_frames)
        menu_profile = str(screen.get("menu_profile", screen.get("menuProfile", "initial"))).strip().lower().replace("-", "_")
        menu_profile_map = {"initial": "Initial", "in_game": "InGame", "ingame": "InGame"}
        if menu_profile not in menu_profile_map:
            raise SystemExit(f"menu_project.screens[{screen_index}].menu_profile invalido: {menu_profile}")
        entry_policy = str(screen.get("entry_policy", screen.get("entryPolicy", "title"))).strip().lower().replace("-", "_")
        entry_policy_map = {"title": "Title", "gameplay": "Gameplay"}
        if entry_policy not in entry_policy_map:
            raise SystemExit(f"menu_project.screens[{screen_index}].entry_policy invalido: {entry_policy}")
        return_policy = str(screen.get("return_policy", screen.get("returnPolicy", "title"))).strip().lower().replace("-", "_")
        return_policy_map = {"title": "Title", "resume": "Resume"}
        if return_policy not in return_policy_map:
            raise SystemExit(f"menu_project.screens[{screen_index}].return_policy invalido: {return_policy}")
        suspends_gameplay = bool(screen.get("suspends_gameplay", screen.get("suspendsGameplay", False)))
        presentation_mode = str(screen.get("presentation_mode", screen.get("presentationMode", "scene"))).strip().lower().replace("-", "_")
        presentation_mode_map = {"scene": "Scene", "hud": "Hud", "both": "Both"}
        if presentation_mode not in presentation_mode_map:
            raise SystemExit(f"menu_project.screens[{screen_index}].presentation_mode invalido: {presentation_mode}")
        hud_list_rows = int(screen.get("hud_list_rows", 0))
        title_text_variable = int(screen.get("title_text_variable", -1))
        carousel = bool(screen.get("carousel", False))
        hud_text_color = int(screen.get("hud_text_color", 32767))
        if not 0 <= hud_text_color <= 32767:
            raise SystemExit("hud_text_color precisa ser RGB555")
        if not 0 <= hud_list_rows <= 6 or not -1 <= title_text_variable < 8:
            raise SystemExit(f"menu_project.screens[{screen_index}] HUD list contract invalido")
        screen_entries.append(
            "    gbs::MenuScreenData { "
            f"{cpp_string_literal(screen.get('name', f'screen_{screen_index}'))}, "
            f"{background_index}, "
            f"{title_line_index}, "
            f"{items_name}, "
            f"{item_count}, "
            f"{on_enter}, "
            f"{on_exit}, "
            f"{resource_group_expr}, "
            f"gbs::MenuScreenType::{screen_type_map[screen_type]}, "
            f"{screen_title_expr}, "
            f"{auto_advance_frames}, "
            f"{'true' if allow_skip else 'false'}, "
            f"{next_screen}, "
            f"{title_overlay_background}, "
            f"{title_fade_frames}, "
            f"{on_back}, "
            f"{actors_name}, "
            f"{actor_count}, "
            f"{text_input_expr}, "
            f"{background_animation_expr}, "
            f"{background_animation_count}, "
            f"{background_animation_duration}, "
            f"{'true' if background_animation_loop else 'false'}, "
            f"gbs::MenuSceneProfile::{menu_profile_map[menu_profile]}, "
            f"gbs::MenuSceneEntryPolicy::{entry_policy_map[entry_policy]}, "
            f"gbs::MenuSceneReturnPolicy::{return_policy_map[return_policy]}, "
            f"{'true' if suspends_gameplay else 'false'}, "
            f"gbs::MenuScenePresentationMode::{presentation_mode_map[presentation_mode]}, {hud_list_rows}, {title_text_variable}, "
            f"{'true' if carousel else 'false'}, {hud_text_color}, "
            f"{'true' if screen.get('hud_transparent_text', False) else 'false'} "
            "},"
        )
    output.append("constexpr gbs::MenuScreenData screens[] = {")
    output.extend(screen_entries)
    output.append("};")
    output.append("")

    output.extend([
        "const gbs::MenuProjectData project {",
        f"    {asset_refs['bg_palettes'][0]},",
        f"    {asset_refs['bg_palettes'][1]},",
        f"    {asset_refs['tile_assets'][0]},",
        f"    {asset_refs['tile_assets'][1]},",
        f"    {backgrounds_name},",
        f"    {background_count},",
        "    screens,",
        f"    {len(screens)},",
        f"    {int(menu_project.get('initial_screen', 0))},",
        f"    {dialogue_lines_name},",
        f"    {dialogue_line_count},",
        "    nullptr,",
        "    0,",
        f"    {resource_banks_name},",
        f"    {resource_bank_count},",
        f"    {resource_bank_groups_name},",
        f"    {resource_bank_group_count},",
        f"    {asset_refs['sfx_assets'][0]},",
        f"    {asset_refs['sfx_assets'][1]},",
        f"    {asset_refs['music_assets'][0]},",
        f"    {asset_refs['music_assets'][1]},",
        f"    {asset_refs['pcm_assets'][0]},",
        f"    {asset_refs['pcm_assets'][1]},",
        f"    {asset_refs['tracker_assets'][0]},",
        f"    {asset_refs['tracker_assets'][1]},",
        f"    {asset_refs['obj_palettes'][0]},",
        f"    {asset_refs['obj_palettes'][1]}"
        "};",
        "",
        "} // namespace gbastudio_menu_project",
        "",
    ])
    return "\n".join(output)


def emit_cutscene_backgrounds(output, cutscene_project, asset_report=None):
    backgrounds = cutscene_project.get("backgrounds", [])
    if backgrounds is None:
        backgrounds = []
    if not isinstance(backgrounds, list):
        raise SystemExit("cutscene_project.backgrounds precisa ser lista")
    if not backgrounds:
        return ("nullptr", 0)

    output.append("constexpr gbs::CutsceneBackgroundData cutscene_backgrounds[] = {")
    for index, background in enumerate(backgrounds):
        if not isinstance(background, dict):
            raise SystemExit(f"cutscene_project.backgrounds[{index}] precisa ser objeto")
        tilemap = background.get("tilemap", background.get("tilemap_asset"))
        if not isinstance(tilemap, str) or not tilemap:
            raise SystemExit(f"cutscene_project.backgrounds[{index}].tilemap precisa ser string")
        tilemap_symbol = resolve_project_asset_symbol(
            tilemap,
            "tilemap",
            asset_report,
            f"cutscene_project.backgrounds[{index}].tilemap",
        )
        layer = background_layer_from_json(background.get("layer", "bg1"))
        output.append(
            "    gbs::CutsceneBackgroundData { "
            f"{cpp_string_literal(background.get('name', f'background_{index}'))}, "
            f"gbs::BackgroundLayer::{layer}, "
            f"{tilemap_symbol}, "
            f"static_cast<uint16_t>({int(background.get('backdrop_color', 0))}) "
            "},"
        )
    output.append("};")
    output.append("")
    return ("cutscene_backgrounds", len(backgrounds))


def emit_cutscene_steps(output, scene, scene_index):
    steps = scene.get("steps", scene.get("timeline", []))
    if steps is None:
        steps = []
    if not isinstance(steps, list) or not steps:
        raise SystemExit(f"cutscene_project.scenes[{scene_index}].steps precisa ser lista nao vazia")

    step_entries = []
    for step_index, step in enumerate(steps):
        if not isinstance(step, dict):
            raise SystemExit(f"cutscene_project.scenes[{scene_index}].steps[{step_index}] precisa ser objeto")
        actor_motions = step.get("actor_motions", step.get("actorMotions", []))
        if actor_motions is None:
            actor_motions = []
        if not isinstance(actor_motions, list):
            raise SystemExit(f"cutscene_project.scenes[{scene_index}].steps[{step_index}].actor_motions precisa ser lista")
        motion_entries = []
        for motion_index, motion in enumerate(actor_motions):
            description = f"cutscene_project.scenes[{scene_index}].steps[{step_index}].actor_motions[{motion_index}]"
            if not isinstance(motion, dict):
                raise SystemExit(f"{description} precisa ser objeto")
            actor_index = int(motion.get("actor_index", motion.get("actorIndex", -1)))
            scene_actors = scene.get("actors", [])
            if not isinstance(scene_actors, list) or actor_index < 0 or actor_index >= len(scene_actors):
                raise SystemExit(f"{description}.actor_index referencia um ator inexistente")
            duration_frames = int(motion.get("duration_frames", motion.get("durationFrames", 0)))
            if duration_frames <= 0 or duration_frames > 65535:
                raise SystemExit(f"{description}.duration_frames fora do intervalo")
            from_position = vec2_from_json(
                motion.get("from_position", motion.get("fromPosition", motion.get("from", {}))),
                f"{description}.from_position",
            )
            to_position = vec2_from_json(
                motion.get("to_position", motion.get("toPosition", motion.get("to", {}))),
                f"{description}.to_position",
            )
            motion_entries.append(
                "    gbs::CutsceneActorMotionData { "
                f"{actor_index}, "
                f"gbs::Vec2i {{ {from_position[0]}, {from_position[1]} }}, "
                f"gbs::Vec2i {{ {to_position[0]}, {to_position[1]} }}, "
                f"static_cast<uint16_t>({duration_frames}) "
                "},"
            )
        motions_name = "nullptr"
        motion_count = 0
        if motion_entries:
            motions_name = f"cutscene_scene_{scene_index}_step_{step_index}_actor_motions"
            output.append(f"constexpr gbs::CutsceneActorMotionData {motions_name}[] = {{")
            output.extend(motion_entries)
            output.append("};")
            output.append("")
            motion_count = len(motion_entries)
        script = emit_event_script(
            output,
            f"cutscene_scene_{scene_index}_step_{step_index}_script",
            step.get("script", step.get("commands")),
            f"cutscene_project.scenes[{scene_index}].steps[{step_index}].script",
        )
        on_skip = emit_event_script(
            output,
            f"cutscene_scene_{scene_index}_step_{step_index}_on_skip",
            step.get("on_skip", step.get("skip_script")),
            f"cutscene_project.scenes[{scene_index}].steps[{step_index}].on_skip",
        )
        branch = step.get("branch", {})
        if branch is None:
            branch = {}
        if not isinstance(branch, dict):
            raise SystemExit(f"cutscene_project.scenes[{scene_index}].steps[{step_index}].branch precisa ser objeto")
        branch_variable = branch.get(
            "variable",
            branch.get("variable_index", step.get("branch_variable", step.get("branch_variable_index", -1))),
        )
        branch_value = branch.get("value", branch.get("equals", step.get("branch_value", 1)))
        branch_target_scene = branch.get(
            "target_scene",
            branch.get("target_scene_index", step.get("branch_target_scene", step.get("target_scene_if", -1))),
        )
        branch_target_step = branch.get(
            "target_step",
            branch.get("target_step_index", step.get("branch_target_step", -1)),
        )
        duration_frames = int(step.get("duration_frames", step.get("duration", 0)))
        if duration_frames < 0 or duration_frames > 65535:
            raise SystemExit(f"cutscene_project.scenes[{scene_index}].steps[{step_index}].duration_frames fora do intervalo")
        resource_group = step.get("resource_bank_group", step.get("bank_group"))
        if resource_group is not None and (not isinstance(resource_group, str) or not resource_group.strip()):
            raise SystemExit(f"cutscene_project.scenes[{scene_index}].steps[{step_index}].resource_bank_group precisa ser string nao vazia")
        resource_group_expr = cpp_string_literal(resource_group) if isinstance(resource_group, str) and resource_group.strip() else "nullptr"
        step_entries.append(
            "    gbs::CutsceneStepData { "
            f"{int(step.get('line', step.get('dialogue_line', step.get('dialogue_line_index', -1))))}, "
            f"static_cast<uint16_t>({duration_frames}), "
            f"{script}, "
            f"{int(step.get('target_scene', step.get('target_scene_index', -1)))}, "
            f"{'true' if bool(step.get('auto_advance', True)) else 'false'}, "
            f"{'true' if bool(step.get('skippable', True)) else 'false'}, "
            f"{on_skip}, "
            f"gbs::CutsceneBranchData {{ {int(branch_variable)}, {int(branch_value)}, {int(branch_target_scene)}, {int(branch_target_step)} }}, "
            f"{'true' if bool(step.get('wait_for_dialogue', step.get('hold_until_dialogue_closed', False))) else 'false'}, "
            f"{int(step.get('background', step.get('background_index', -1)))}, "
            f"{resource_group_expr}, "
            f"{motions_name}, "
            f"{motion_count} "
            "},"
        )

    steps_name = f"cutscene_scene_{scene_index}_steps"
    output.append(f"constexpr gbs::CutsceneStepData {steps_name}[] = {{")
    output.extend(step_entries)
    output.append("};")
    output.append("")
    return (steps_name, len(steps))


def emit_cutscene_actors(output, scene, scene_index, asset_report=None):
    actors = scene.get("actors", [])
    if actors is None:
        actors = []
    if not isinstance(actors, list):
        raise SystemExit(f"cutscene_project.scenes[{scene_index}].actors precisa ser lista")
    if not actors:
        return ("nullptr", 0)

    actor_entries = []
    for actor_index, actor in enumerate(actors):
        description = f"cutscene_project.scenes[{scene_index}].actors[{actor_index}]"
        if not isinstance(actor, dict):
            raise SystemExit(f"{description} precisa ser objeto")
        name = actor.get("name", f"actor_{actor_index}")
        if not isinstance(name, str) or not name:
            raise SystemExit(f"{description}.name precisa ser string")
        metasprite = resolve_project_metasprite_symbol(
            actor.get("metasprite"),
            None,
            asset_report,
            f"{description}.metasprite",
        )
        if metasprite is None:
            raise SystemExit(f"{description}.metasprite precisa referenciar asset valido")
        position = vec2_from_json(
            actor.get("position", {"x": actor.get("x", 0), "y": actor.get("y", 0)}),
            f"{description}.position",
        )
        actor_entries.append(
            "    gbs::CutsceneActorData { "
            f"{cpp_string_literal(name)}, &{metasprite}, "
            f"gbs::Vec2i {{ {position[0]}, {position[1]} }} "
            "},"
        )

    actors_name = f"cutscene_scene_{scene_index}_actors"
    output.append(f"constexpr gbs::CutsceneActorData {actors_name}[] = {{")
    output.extend(actor_entries)
    output.append("};")
    output.append("")
    return (actors_name, len(actor_entries))


def emit_cutscene_project_data_header(cutscene_project, asset_report=None):
    if not isinstance(cutscene_project, dict):
        raise SystemExit("cutscene_project precisa ser objeto")
    scenes = cutscene_project.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        raise SystemExit("cutscene_project.scenes precisa ser lista nao vazia")

    output = [
        "#pragma once",
        "#include <stddef.h>",
        "#include <stdint.h>",
        "#include \"gbs/cutscene.hpp\"",
        "#include \"gbs/runtime_save_restore.hpp\"",
    ]
    for include in merge_includes(
        string_list_from_json(cutscene_project.get("includes", []), "cutscene_project.includes"),
        project_auto_includes(cutscene_project, asset_report),
    ):
        output.append(f"#include {cpp_string_literal(include)}")
    output.extend([
        "",
        "namespace gbastudio_cutscene_project {",
        "",
    ])

    save_config = save_config_from_json(cutscene_project.get("save"), "cutscene_project.save", "GBCS", 0)
    emit_save_config(output, save_config)

    asset_refs = emit_project_asset_references(output, cutscene_project, "cutscene_project", "cutscene_project", include_audio=True, asset_report=asset_report)
    backgrounds_name, background_count = emit_cutscene_backgrounds(output, cutscene_project, asset_report)
    resource_banks_name, resource_bank_count, resource_bank_groups_name, resource_bank_group_count = emit_project_resource_banks(
        output,
        cutscene_project,
        "cutscene_project",
        asset_report,
    )
    resource_bank_upload_sources_name, resource_bank_upload_source_count = emit_resource_bank_upload_sources(
        output,
        asset_report,
    )

    dialogue_lines_name, dialogue_line_count = emit_dialogue_lines(
        output,
        cutscene_project.get("dialogue_lines", []),
        "cutscene_project.dialogue_lines",
    )
    portrait_assets = dialogue_portrait_assets_from_json(
        cutscene_project.get("portrait_assets"),
        "cutscene_project.portrait_assets",
        asset_report,
    )
    emit_dialogue_portrait_assets(output, portrait_assets)

    scene_entries = []
    for scene_index, scene in enumerate(scenes):
        if not isinstance(scene, dict):
            raise SystemExit(f"cutscene_project.scenes[{scene_index}] precisa ser objeto")
        steps_name, step_count = emit_cutscene_steps(output, scene, scene_index)
        actors_name, actor_count = emit_cutscene_actors(output, scene, scene_index, asset_report)
        on_enter = emit_event_script(
            output,
            f"cutscene_scene_{scene_index}_on_enter",
            scene.get("on_enter"),
            f"cutscene_project.scenes[{scene_index}].on_enter",
        )
        on_exit = emit_event_script(
            output,
            f"cutscene_scene_{scene_index}_on_exit",
            scene.get("on_exit"),
            f"cutscene_project.scenes[{scene_index}].on_exit",
        )
        background_index = int(scene.get("background", scene.get("background_index", -1)))
        next_scene_index = int(scene.get("next_scene", scene.get("next_scene_index", -1)))
        resource_group = scene.get("resource_bank_group", scene.get("bank_group"))
        resource_group_expr = cpp_string_literal(resource_group) if isinstance(resource_group, str) and resource_group else "nullptr"
        scene_entries.append(
            "    gbs::CutsceneSceneData { "
            f"{cpp_string_literal(scene.get('name', f'scene_{scene_index}'))}, "
            f"{background_index}, "
            f"{steps_name}, "
            f"{step_count}, "
            f"{next_scene_index}, "
            f"{on_enter}, "
            f"{on_exit}, "
            f"{resource_group_expr}, "
            f"{actors_name}, "
            f"{actor_count} "
            "},"
        )
    output.append("constexpr gbs::CutsceneSceneData scenes[] = {")
    output.extend(scene_entries)
    output.append("};")
    output.append("")

    output.extend([
        "const gbs::CutsceneProjectData project {",
        f"    {asset_refs['bg_palettes'][0]},",
        f"    {asset_refs['bg_palettes'][1]},",
        f"    {asset_refs['tile_assets'][0]},",
        f"    {asset_refs['tile_assets'][1]},",
        f"    {backgrounds_name},",
        f"    {background_count},",
        "    scenes,",
        f"    {len(scenes)},",
        f"    {int(cutscene_project.get('initial_scene', 0))},",
        f"    {dialogue_lines_name},",
        f"    {dialogue_line_count},",
        "    nullptr,",
        "    0,",
        f"    {resource_banks_name},",
        f"    {resource_bank_count},",
        f"    {resource_bank_groups_name},",
        f"    {resource_bank_group_count},",
        f"    {asset_refs['sfx_assets'][0]},",
        f"    {asset_refs['sfx_assets'][1]},",
        f"    {asset_refs['music_assets'][0]},",
        f"    {asset_refs['music_assets'][1]},",
        f"    {asset_refs['pcm_assets'][0]},",
        f"    {asset_refs['pcm_assets'][1]},",
        f"    {asset_refs['tracker_assets'][0]},",
        f"    {asset_refs['tracker_assets'][1]},",
        f"    {asset_refs['obj_palettes'][0]},",
        f"    {asset_refs['obj_palettes'][1]},",
        "    dialogue_portrait_assets,",
        "    dialogue_portrait_asset_count,",
        f"    {resource_bank_upload_sources_name},",
        f"    {resource_bank_upload_source_count}",
        "};",
        "",
        "} // namespace gbastudio_cutscene_project",
        "",
    ])
    return "\n".join(output)


def emit_world_map_backgrounds(output, world_map_project, asset_report=None):
    backgrounds = world_map_project.get("backgrounds", [])
    if backgrounds is None:
        backgrounds = []
    if not isinstance(backgrounds, list):
        raise SystemExit("world_map_project.backgrounds precisa ser lista")
    if not backgrounds:
        return ("nullptr", 0)

    output.append("constexpr gbs::WorldMapBackgroundData world_map_backgrounds[] = {")
    for index, background in enumerate(backgrounds):
        if not isinstance(background, dict):
            raise SystemExit(f"world_map_project.backgrounds[{index}] precisa ser objeto")
        tilemap = background.get("tilemap", background.get("tilemap_asset"))
        if not isinstance(tilemap, str) or not tilemap:
            raise SystemExit(f"world_map_project.backgrounds[{index}].tilemap precisa ser string")
        tilemap_symbol = resolve_project_asset_symbol(
            tilemap,
            "tilemap",
            asset_report,
            f"world_map_project.backgrounds[{index}].tilemap",
        )
        if bool(background.get("backdrop_from_tilemap_palette", False)):
            palette_symbol = resolve_project_asset_symbol(
                tilemap,
                "palette_asset",
                asset_report,
                f"world_map_project.backgrounds[{index}].tilemap",
            )
            backdrop_color = f"{palette_symbol}.colors[0]"
        else:
            backdrop_color = str(int(background.get("backdrop_color", 0)))
        source = background.get("source_tiles")
        source_symbol = "&" + resolve_project_asset_symbol(source, "tile_asset", asset_report, "world_map.source_tiles") if source else "nullptr"
        layer = background_layer_from_json(background.get("layer", "bg1"))
        output.append(
            "    gbs::WorldMapBackgroundData { "
            f"{cpp_string_literal(background.get('name', f'background_{index}'))}, "
            f"gbs::BackgroundLayer::{layer}, "
            f"{tilemap_symbol}, "
            f"static_cast<uint16_t>({backdrop_color}), {source_symbol} "
            "},"
        )
    output.append("};")
    output.append("")
    return ("world_map_backgrounds", len(backgrounds))


def world_map_connection_indices(connections, node_name_to_index, context):
    if connections is None:
        return []
    if not isinstance(connections, list):
        raise SystemExit(f"{context} precisa ser lista")
    indices = []
    for index, value in enumerate(connections):
        if isinstance(value, int):
            indices.append(value)
        elif isinstance(value, str) and value in node_name_to_index:
            indices.append(node_name_to_index[value])
        else:
            raise SystemExit(f"{context}[{index}] precisa ser indice ou nome de node existente")
    return indices


def emit_world_map_connections(output, node, node_index, node_name_to_index):
    connections = world_map_connection_indices(
        node.get("connections", node.get("links", [])),
        node_name_to_index,
        f"world_map_project.nodes[{node_index}].connections",
    )
    if not connections:
        return ("nullptr", 0)
    name = f"world_map_node_{node_index}_connections"
    output.append(f"constexpr int {name}[] = {{")
    for connection in connections:
        output.append(f"    {int(connection)},")
    output.append("};")
    output.append("")
    return (name, len(connections))


def world_map_position_from_node(node, node_index):
    position = node.get("position", node.get("position_pixels"))
    if position is None:
        return (int(node.get("x", 0)), int(node.get("y", 0)))
    if not isinstance(position, dict):
        raise SystemExit(f"world_map_project.nodes[{node_index}].position precisa ser objeto")
    return (int(position.get("x", 0)), int(position.get("y", 0)))


def emit_world_map_project_data_header(world_map_project, asset_report=None):
    if not isinstance(world_map_project, dict):
        raise SystemExit("world_map_project precisa ser objeto")
    nodes = world_map_project.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        raise SystemExit("world_map_project.nodes precisa ser lista nao vazia")

    node_name_to_index = {}
    for index, node in enumerate(nodes):
        if not isinstance(node, dict):
            raise SystemExit(f"world_map_project.nodes[{index}] precisa ser objeto")
        name = node.get("name", f"node_{index}")
        if isinstance(name, str) and name:
            node_name_to_index[name] = index

    output = [
        "#pragma once",
        "#include <stddef.h>",
        "#include <stdint.h>",
        "#include \"gbs/runtime_save_restore.hpp\"",
        "#include \"gbs/world_map.hpp\"",
    ]
    for include in merge_includes(
        string_list_from_json(world_map_project.get("includes", []), "world_map_project.includes"),
        project_auto_includes(world_map_project, asset_report),
    ):
        output.append(f"#include {cpp_string_literal(include)}")
    output.extend([
        "",
        "namespace gbastudio_world_map_project {",
        "",
    ])

    asset_refs = emit_project_asset_references(output, world_map_project, "world_map_project", "world_map_project", include_audio=True, asset_report=asset_report)
    cursor_value = world_map_project.get("cursor")
    if isinstance(cursor_value, dict) and cursor_value.get("metasprite") is not None:
        cursor_value = cursor_value.get("metasprite")
    cursor_metasprite = resolve_project_metasprite_symbol(
        cursor_value,
        None,
        asset_report,
        "world_map_project.cursor.metasprite",
    )
    marker_value = world_map_project.get("marker")
    if isinstance(marker_value, dict) and marker_value.get("metasprite") is not None:
        marker_value = marker_value.get("metasprite")
    marker_metasprite = resolve_project_metasprite_symbol(
        marker_value,
        None,
        asset_report,
        "world_map_project.marker.metasprite",
    )
    script_entries = emit_topdown_project_scripts(output, world_map_project)
    if script_entries:
        output.append("constexpr gbs::EventScript project_scripts[] = {")
        output.extend(f"    {entry}," for entry in script_entries)
        output.append("};")
    on_enter = emit_event_script(output, "world_map_on_enter", world_map_project.get("on_enter"), "world_map.on_enter")
    on_cancel = emit_event_script(output, "world_map_on_cancel", world_map_project.get("on_cancel"), "world_map.on_cancel")
    on_start = emit_event_script(output, "world_map_on_start", world_map_project.get("on_start"), "world_map.on_start")
    save_config = save_config_from_json(world_map_project.get("save"), "world_map_project.save", "GBWM", 0)
    emit_save_config(output, save_config)
    backgrounds_name, background_count = emit_world_map_backgrounds(output, world_map_project, asset_report)
    resource_banks_name, resource_bank_count, resource_bank_groups_name, resource_bank_group_count = emit_project_resource_banks(
        output,
        world_map_project,
        "world_map_project",
        asset_report,
    )

    dialogue_lines_name, dialogue_line_count = emit_dialogue_lines(
        output,
        world_map_project.get("dialogue_lines", []),
        "world_map_project.dialogue_lines",
    )

    node_entries = []
    for node_index, node in enumerate(nodes):
        connections_name, connection_count = emit_world_map_connections(output, node, node_index, node_name_to_index)
        on_focus = emit_event_script(
            output,
            f"world_map_node_{node_index}_on_focus",
            node.get("on_focus"),
            f"world_map_project.nodes[{node_index}].on_focus",
        )
        on_select = emit_event_script(
            output,
            f"world_map_node_{node_index}_on_select",
            node.get("on_select", node.get("script")),
            f"world_map_project.nodes[{node_index}].on_select",
        )
        on_locked = emit_event_script(
            output,
            f"world_map_node_{node_index}_on_locked",
            node.get("on_locked", node.get("locked_script")),
            f"world_map_project.nodes[{node_index}].on_locked",
        )
        x, y = world_map_position_from_node(node, node_index)
        line_index = int(node.get("line", node.get("dialogue_line", node.get("dialogue_line_index", -1))))
        locked_line_index = int(node.get("locked_line", node.get("locked_dialogue_line", node.get("locked_line_index", -1))))
        target_level = int(node.get("target_level", node.get("target_level_index", node.get("level", -1))))
        resource_group = node.get("resource_bank_group", node.get("bank_group"))
        resource_group_expr = cpp_string_literal(resource_group) if isinstance(resource_group, str) and resource_group else "nullptr"
        required_variable = int(node.get("required_variable", node.get("required_var", node.get("unlock_variable", node.get("unlock_variable_index", -1)))))
        required_value = int(node.get("required_value", node.get("unlock_value", 1)))
        hide_when_locked = bool(node.get("hide_when_locked", node.get("hide_locked", node.get("hidden_until_unlocked", False))))
        node_entries.append(
            "    gbs::WorldMapNodeData { "
            f"{cpp_string_literal(node.get('name', f'node_{node_index}'))}, "
            f"gbs::Vec2i {{ {x}, {y} }}, "
            f"{line_index}, "
            f"{connections_name}, "
            f"{connection_count}, "
            f"{target_level}, "
            f"{'true' if bool(node.get('unlocked', True)) else 'false'}, "
            f"{on_focus}, "
            f"{on_select}, "
            f"{resource_group_expr}, "
            f"{required_variable}, "
            f"{required_value}, "
            f"{'true' if hide_when_locked else 'false'}, "
            f"{locked_line_index}, "
            f"{on_locked}, {cpp_string_literal(node.get('label', node.get('name', '')))} "
            "},"
        )
    output.append("constexpr gbs::WorldMapNodeData nodes[] = {")
    output.extend(node_entries)
    output.append("};")
    output.append("")

    output.extend([
        "const gbs::WorldMapProjectData project {",
        f"    {asset_refs['bg_palettes'][0]},",
        f"    {asset_refs['bg_palettes'][1]},",
        f"    {asset_refs['tile_assets'][0]},",
        f"    {asset_refs['tile_assets'][1]},",
        f"    {backgrounds_name},",
        f"    {background_count},",
        f"    {int(world_map_project.get('background', world_map_project.get('background_index', -1)))},",
        "    nodes,",
        f"    {len(nodes)},",
        f"    {int(world_map_project.get('initial_node', 0))},",
        f"    {dialogue_lines_name},",
        f"    {dialogue_line_count},",
        f"    {'project_scripts' if script_entries else 'nullptr'},",
        f"    {len(script_entries)},",
        f"    {resource_banks_name},",
        f"    {resource_bank_count},",
        f"    {resource_bank_groups_name},",
        f"    {resource_bank_group_count},",
        f"    {asset_refs['sfx_assets'][0]},",
        f"    {asset_refs['sfx_assets'][1]},",
        f"    {asset_refs['music_assets'][0]},",
        f"    {asset_refs['music_assets'][1]},",
        f"    {asset_refs['pcm_assets'][0]},",
        f"    {asset_refs['pcm_assets'][1]},",
        f"    {asset_refs['tracker_assets'][0]},",
        f"    {asset_refs['tracker_assets'][1]},",
        f"    {asset_refs['obj_palettes'][0]},",
        f"    {asset_refs['obj_palettes'][1]},",
        f"    {'&' + cursor_metasprite if cursor_metasprite else 'nullptr'},",
        f"    {'&' + marker_metasprite if marker_metasprite else 'nullptr'},",
        f"    {cpp_string_literal(world_map_project.get('scene_name', ''))},",
        f"    {on_enter}, {on_cancel}, {on_start},",
        f"    {max(1, min(600, int(world_map_project.get('journey_frames', 120))))},",
        f"    {'true' if world_map_project.get('cursor_affine', False) else 'false'},",
        f"    {'true' if world_map_project.get('embedded_nodes', False) else 'false'}",
        "};",
        "",
        "} // namespace gbastudio_world_map_project",
        "",
    ])
    return "\n".join(output)


def shmup_enemy_movement_kind_from_json(value):
    mode = str(value).strip().lower().replace("-", "_")
    mapping = {
        "static": "Static",
        "none": "Static",
        "linear": "Linear",
        "sine": "Sine",
        "sin": "Sine",
        "dive": "Dive",
    }
    if mode not in mapping:
        raise SystemExit(f"shmup enemy movement invalido: {value}")
    return mapping[mode]


def shmup_scene_composition_layer(shmup_project, layer_name):
    composition = shmup_project.get("composition", {})
    if not isinstance(composition, dict) or not bool(composition.get("enabled", False)):
        return {}
    layers = composition.get("layers", [])
    if not isinstance(layers, list):
        return {}
    for layer in layers:
        if not isinstance(layer, dict):
            continue
        if str(layer.get("layer", "")).upper() == layer_name and layer.get("kind") == "regular_bg":
            return layer
    return {}


def scene_render_target_mask(targets):
    target_bits = {
        "BG0": "gbs::RenderLayerBG0",
        "BG1": "gbs::RenderLayerBG1",
        "BG2": "gbs::RenderLayerBG2",
        "BG3": "gbs::RenderLayerBG3",
        "OBJ": "gbs::RenderLayerOBJ",
        "BACKDROP": "gbs::RenderLayerBackdrop",
    }
    if not isinstance(targets, list):
        return "0"
    bits = [target_bits[target] for target in targets if target in target_bits]
    return " | ".join(bits) if bits else "0"


def scene_blend_mode(value):
    return {
        "none": "None",
        "alpha": "Alpha",
        "brighten": "Brighten",
        "darken": "Darken",
    }.get(str(value).lower(), "None")


def scene_composition_window_literal(window):
    if not isinstance(window, dict):
        window = {}
    return (
        "gbs::WindowConfig { "
        f"gbs::WindowRect {{ {int(window.get('left', 0))}, {int(window.get('right', 240))}, "
        f"{int(window.get('top', 0))}, {int(window.get('bottom', 160))} }}, "
        f"{scene_render_target_mask(window.get('insideTargets', []))}, "
        f"{scene_render_target_mask(window.get('outsideTargets', []))}, "
        f"{'true' if bool(window.get('enabled', False)) else 'false'} "
        "}"
    )


def shmup_scene_composition_literal(shmup_project, description, asset_report=None, output=None):
    composition = shmup_project.get("composition", {})
    if composition is None:
        composition = {}
    if not isinstance(composition, dict):
        raise SystemExit(f"{description}.composition precisa ser objeto")
    effects = composition.get("effects", {})
    if effects is None:
        effects = {}
    if not isinstance(effects, dict):
        raise SystemExit(f"{description}.composition.effects precisa ser objeto")

    blend = effects.get("blend", {})
    if not isinstance(blend, dict):
        blend = {}
    mosaic = effects.get("mosaic", {})
    if not isinstance(mosaic, dict):
        mosaic = {}
    window0 = effects.get("window0", {})
    window1 = effects.get("window1", {})
    hblank = effects.get("hblank", {})
    if not isinstance(hblank, dict):
        hblank = {}
    offsets = hblank.get("scroll_offsets", [])
    if offsets is None:
        offsets = []
    if not isinstance(offsets, list):
        raise SystemExit(f"{description}.composition.effects.hblank.scroll_offsets precisa ser lista")
    hblank_enabled = bool(hblank.get("enabled", False))
    if hblank_enabled and (hblank.get("hdma") is not True or len(offsets) != 160):
        raise SystemExit(f"{description}.composition.effects.hblank requer hdma=true e 160 offsets")

    timeline = hblank.get("timeline", [])
    if timeline is None:
        timeline = []
    if not isinstance(timeline, list):
        raise SystemExit(f"{description}.composition.effects.hblank.timeline precisa ser lista")
    timeline_name = "shmup_scene_hblank_timeline"
    timeline_entries = []
    previous_frame = -1
    for timeline_index, keyframe in enumerate(timeline):
        if not isinstance(keyframe, dict):
            raise SystemExit(f"{description}.composition.effects.hblank.timeline[{timeline_index}] precisa ser objeto")
        frame = keyframe.get("frame")
        keyframe_offsets = keyframe.get("scroll_offsets", keyframe.get("scrollOffsets", []))
        if not isinstance(frame, int) or isinstance(frame, bool) or frame < 0 or frame > 65535 or frame <= previous_frame:
            raise SystemExit(f"{description}.composition.effects.hblank.timeline[{timeline_index}].frame invalido ou fora de ordem")
        if not isinstance(keyframe_offsets, list) or len(keyframe_offsets) != 160:
            raise SystemExit(f"{description}.composition.effects.hblank.timeline[{timeline_index}] requer exatamente 160 offsets")
        if any(not isinstance(offset, int) or isinstance(offset, bool) or offset < -32768 or offset > 32767 for offset in keyframe_offsets):
            raise SystemExit(f"{description}.composition.effects.hblank.timeline[{timeline_index}] possui offset fora do intervalo")
        if not hblank_enabled or hblank.get("hdma") is not True:
            raise SystemExit(f"{description}.composition.effects.hblank.timeline requer HBlank habilitado com hdma=true")
        keyframe_offsets_name = f"{timeline_name}_{timeline_index}_scroll_offsets"
        if output is None:
            raise SystemExit("saida interna ausente ao emitir timeline HBlank")
        output.append(
            f"constexpr int16_t {keyframe_offsets_name}[160] = {{ "
            f"{', '.join(str(int(value)) for value in keyframe_offsets)} "
            "};"
        )
        output.append("")
        timeline_entries.append((frame, keyframe_offsets_name))
        previous_frame = frame
    if timeline_entries:
        output.append(f"constexpr gbs::ShmupHBlankTimelineKeyframe {timeline_name}[] = {{")
        for frame, keyframe_offsets_name in timeline_entries:
            output.append(f"    {{ {frame}, {keyframe_offsets_name}, 160 }},")
        output.append("};")
        output.append("")

    offsets_name = "shmup_scene_hblank_scroll_offsets"
    if hblank_enabled:
        if output is None:
            raise SystemExit("saida interna ausente ao emitir tabela HBlank")
        output.append(
            f"constexpr int16_t {offsets_name}[160] = {{ "
            f"{', '.join(str(int(value)) for value in offsets)} "
            "};"
        )
        output.append("")
    hblank_layer = background_layer_from_json(hblank.get("layer", "BG2"))
    if hblank_layer not in ("BG1", "BG2", "BG3"):
        raise SystemExit(f"{description}.composition.effects.hblank.layer precisa ser BG1, BG2 ou BG3")
    hblank_offsets = offsets_name if hblank_enabled else "nullptr"
    hblank_count = "160" if hblank_enabled else "0"
    hblank_timeline = timeline_name if timeline_entries else "nullptr"
    hblank_timeline_count = str(len(timeline_entries)) if timeline_entries else "0"

    video_literal = video_composition_literal(shmup_project, description, asset_report)
    return (
        "gbs::ShmupSceneComposition { "
        f"{'true' if bool(composition.get('enabled', False)) else 'false'}, "
        f"{video_literal}, "
        f"{'true' if bool(blend.get('enabled', False)) else 'false'}, "
        "gbs::BlendConfig { "
        f"{scene_render_target_mask(blend.get('first_targets', []))}, "
        f"{scene_render_target_mask(blend.get('second_targets', []))}, "
        f"gbs::BlendMode::{scene_blend_mode(blend.get('mode', 'none'))}, "
        f"static_cast<uint8_t>({int(blend.get('eva', 8))}), "
        f"static_cast<uint8_t>({int(blend.get('evb', 8))}), "
        f"static_cast<uint8_t>({int(blend.get('intensity', 0))}) }}, "
        f"{'true' if bool(mosaic.get('enabled', False)) else 'false'}, "
        "gbs::MosaicConfig { "
        f"static_cast<uint8_t>({int(mosaic.get('bgX', 0))}), "
        f"static_cast<uint8_t>({int(mosaic.get('bgY', 0))}), "
        f"static_cast<uint8_t>({int(mosaic.get('objX', 0))}), "
        f"static_cast<uint8_t>({int(mosaic.get('objY', 0))}) }}, "
        f"{scene_composition_window_literal(window0)}, "
        f"{scene_composition_window_literal(window1)}, "
        f"{'true' if hblank_enabled else 'false'}, "
        f"gbs::BackgroundLayer::{hblank_layer}, "
        f"{hblank_offsets}, {hblank_count}, "
        f"{hblank_timeline}, {hblank_timeline_count} "
        "}"
    )


def emit_shmup_backgrounds(output, shmup_project, asset_report=None):
    backgrounds = shmup_project.get("backgrounds", [])
    if backgrounds is None:
        backgrounds = []
    if not isinstance(backgrounds, list):
        raise SystemExit("shmup_project.backgrounds precisa ser lista")
    if not backgrounds:
        return ("nullptr", 0)

    background_entries = []
    for index, background in enumerate(backgrounds):
        if not isinstance(background, dict):
            raise SystemExit(f"shmup_project.backgrounds[{index}] precisa ser objeto")
        description = f"shmup_project.backgrounds[{index}]"
        video = background.get("video")
        has_video = isinstance(video, dict) and (
            int(video.get("display_mode", 0)) != 0
            or isinstance(video.get("affine"), dict)
            or isinstance(video.get("bitmap"), dict)
        )
        layers = background.get("layers")
        if layers is None:
            layers = [] if has_video else [background]
        if not isinstance(layers, list) or (not layers and not has_video):
            raise SystemExit(f"{description}.layers precisa ser lista nao vazia quando o fundo nao usa video Affine/bitmap")
        layer_entries = []
        for layer_index, layer_entry in enumerate(layers):
            if not isinstance(layer_entry, dict):
                raise SystemExit(f"shmup_project.backgrounds[{index}].layers[{layer_index}] precisa ser objeto")
            tilemap = layer_entry.get("tilemap", layer_entry.get("tilemap_asset"))
            if not isinstance(tilemap, str) or not tilemap:
                raise SystemExit(f"shmup_project.backgrounds[{index}].layers[{layer_index}].tilemap precisa ser string")
            tilemap_symbol = resolve_project_asset_symbol(
                tilemap,
                "tilemap",
                asset_report,
                f"{description}.layers[{layer_index}].tilemap",
            )
            layer = background_layer_from_json(layer_entry.get("layer", "bg2"))
            scroll = vec2_from_json(
                layer_entry.get("scroll", layer_entry.get("scroll_pixels_per_frame", {"x": 0, "y": 1})),
                f"{description}.layers[{layer_index}].scroll",
            )
            composition_layer = shmup_scene_composition_layer(shmup_project, layer)
            priority = max(0, min(3, int(composition_layer.get("priority", 2))))
            mosaic_enabled = bool(
                isinstance(shmup_project.get("composition"), dict)
                and isinstance(shmup_project["composition"].get("effects"), dict)
                and isinstance(shmup_project["composition"]["effects"].get("mosaic"), dict)
                and shmup_project["composition"]["effects"]["mosaic"].get("enabled", False)
            )
            parallax_x = max(-1024, min(1024, int(composition_layer.get("parallax_x256", 256))))
            parallax_y = max(-1024, min(1024, int(composition_layer.get("parallax_y256", 256))))
            parallax_offset_x = int(composition_layer.get("scroll_x", 0))
            parallax_offset_y = int(composition_layer.get("scroll_y", 0))
            layer_entries.append(
                "    gbs::ShmupBackgroundLayerData { "
                f"gbs::BackgroundLayer::{layer}, "
                f"{tilemap_symbol}, "
                f"gbs::Vec2i {{ {scroll[0]}, {scroll[1]} }}, "
                f"static_cast<uint8_t>({priority}), "
                f"{'true' if mosaic_enabled else 'false'}, "
                f"static_cast<int16_t>({parallax_x}), "
                f"static_cast<int16_t>({parallax_y}), "
                f"gbs::Vec2i {{ 0, 0 }}, "
                f"gbs::Vec2i {{ {parallax_offset_x}, {parallax_offset_y} }} "
                "},"
            )
        layers_name = f"shmup_background_{index}_layers" if layer_entries else "nullptr"
        if layer_entries:
            output.append(f"constexpr gbs::ShmupBackgroundLayerData {layers_name}[] = {{")
            output.extend(layer_entries)
            output.append("};")

        collision_flags = background.get("collision_flags")
        collision_name = "nullptr"
        collision_count = 0
        collision_width = int(background.get("collision_width_tiles", 0))
        collision_height = int(background.get("collision_height_tiles", 0))
        if collision_flags is not None:
            if not isinstance(collision_flags, list) or any(
                not isinstance(value, int) or isinstance(value, bool) or value < 0 or value > 255
                for value in collision_flags
            ):
                raise SystemExit(f"{description}.collision_flags precisa ser lista de inteiros entre 0 e 255")
            collision_count = len(collision_flags)
            if collision_count > 0 and (collision_width <= 0 or collision_height <= 0 or collision_width * collision_height != collision_count):
                raise SystemExit(f"{description}.collision_flags precisa corresponder as dimensoes declaradas")
            if collision_count > 0:
                collision_name = f"shmup_background_{index}_collision_flags"
                output.append(f"constexpr uint8_t {collision_name}[{collision_count}] = {{")
                for start in range(0, collision_count, 16):
                    chunk = collision_flags[start:start + 16]
                    suffix = "," if start + 16 < collision_count else ""
                    output.append("    " + ", ".join(str(value) for value in chunk) + suffix)
                output.append("};")

        has_extended_contract = has_video or collision_count > 0 or any(
            key in background for key in (
                "world_width_pixels",
                "world_height_pixels",
                "affine_scroll_pixels_per_frame",
            )
        )
        video_literal = room_video_composition_literal(
            background,
            description,
            asset_report,
        ) if has_video else "gbs::default_video_composition()"
        world_width = int(background.get("world_width_pixels", int(background.get("width_tiles", 0)) * 8))
        world_height = int(background.get("world_height_pixels", int(background.get("height_tiles", 0)) * 8))
        affine_scroll = vec2_from_json(
            background.get("affine_scroll_pixels_per_frame", {"x": 0, "y": 0}),
            f"{description}.affine_scroll_pixels_per_frame",
        )
        extended_fields = ""
        if has_extended_contract:
            extended_fields = (
                f", {video_literal}, "
                f"{collision_name}, {collision_count}, "
                f"static_cast<uint16_t>({collision_width}), "
                f"static_cast<uint16_t>({collision_height}), "
                f"static_cast<uint16_t>({world_width}), "
                f"static_cast<uint16_t>({world_height}), "
                f"gbs::Vec2i {{ {affine_scroll[0]}, {affine_scroll[1]} }}"
            )
        background_entries.append(
            "    gbs::ShmupBackgroundData { "
            f"{cpp_string_literal(background.get('name', f'background_{index}'))}, "
            f"{layers_name}, "
            f"{len(layer_entries)}, "
            f"static_cast<uint16_t>({int(background.get('backdrop_color', 0))})"
            f"{extended_fields} "
            "},"
        )
    output.append("constexpr gbs::ShmupBackgroundData shmup_backgrounds[] = {")
    output.extend(background_entries)
    output.append("};")
    output.append("")
    return ("shmup_backgrounds", len(backgrounds))


def shmup_vec_from_entry(entry, key, fallback, description):
    value = entry.get(key)
    if value is None:
        value = entry.get(f"{key}_pixels")
    if value is None:
        value = fallback
    return vec2_from_json(value, description)


def emit_shmup_enemies(output, wave, wave_index, asset_report=None):
    enemies = wave.get("enemies", [])
    if enemies is None:
        enemies = []
    if not isinstance(enemies, list):
        raise SystemExit(f"shmup_project.waves[{wave_index}].enemies precisa ser lista")
    if not enemies:
        return ("nullptr", 0)

    enemy_entries = []
    for enemy_index, enemy in enumerate(enemies):
        if not isinstance(enemy, dict):
            raise SystemExit(f"shmup_project.waves[{wave_index}].enemies[{enemy_index}] precisa ser objeto")
        position = shmup_vec_from_entry(
            enemy,
            "position",
            {"x": int(enemy.get("x", 0)), "y": int(enemy.get("y", 0))},
            f"shmup_project.waves[{wave_index}].enemies[{enemy_index}].position",
        )
        size = shmup_vec_from_entry(
            enemy,
            "size",
            {"x": 16, "y": 16},
            f"shmup_project.waves[{wave_index}].enemies[{enemy_index}].size",
        )
        velocity = shmup_vec_from_entry(
            enemy,
            "velocity",
            {"x": 0, "y": 1},
            f"shmup_project.waves[{wave_index}].enemies[{enemy_index}].velocity",
        )
        projectile_offset = shmup_vec_from_entry(
            enemy,
            "projectile_offset",
            {"x": 6, "y": 12},
            f"shmup_project.waves[{wave_index}].enemies[{enemy_index}].projectile_offset",
        )
        on_spawn = emit_event_script(
            output,
            f"shmup_wave_{wave_index}_enemy_{enemy_index}_on_spawn",
            enemy.get("on_spawn"),
            f"shmup_project.waves[{wave_index}].enemies[{enemy_index}].on_spawn",
        )
        on_destroy = emit_event_script(
            output,
            f"shmup_wave_{wave_index}_enemy_{enemy_index}_on_destroy",
            enemy.get("on_destroy", enemy.get("script")),
            f"shmup_project.waves[{wave_index}].enemies[{enemy_index}].on_destroy",
        )
        on_hit_player = emit_event_script(
            output,
            f"shmup_wave_{wave_index}_enemy_{enemy_index}_on_hit_player",
            enemy.get("on_hit_player"),
            f"shmup_project.waves[{wave_index}].enemies[{enemy_index}].on_hit_player",
        )
        resource_group = enemy.get("resource_bank_group", enemy.get("bank_group"))
        resource_group_expr = cpp_string_literal(resource_group) if isinstance(resource_group, str) and resource_group else "nullptr"
        enemy_metasprite = resolve_project_metasprite_symbol(
            project_actor_visual_ref(enemy),
            None,
            asset_report,
            f"shmup_project.waves[{wave_index}].enemies[{enemy_index}].metasprite",
        )
        enemy_metasprite_expr = f"&{enemy_metasprite}" if enemy_metasprite else "nullptr"
        enemy_entries.append(
            "    gbs::ShmupEnemyData { "
            f"{cpp_string_literal(enemy.get('name', f'enemy_{enemy_index}'))}, "
            f"gbs::Vec2i {{ {position[0]}, {position[1]} }}, "
            f"gbs::Vec2i {{ {size[0]}, {size[1]} }}, "
            f"gbs::Vec2i {{ {velocity[0]}, {velocity[1]} }}, "
            f"gbs::ShmupEnemyMovementKind::{shmup_enemy_movement_kind_from_json(enemy.get('movement', 'linear'))}, "
            f"static_cast<uint8_t>({int(enemy.get('health', 1))}), "
            f"static_cast<uint16_t>({int(enemy.get('score', enemy.get('score_value', 100)))}), "
            f"static_cast<uint8_t>({int(enemy.get('fire_interval', enemy.get('fire_interval_frames', 0)))}), "
            f"gbs::Vec2i {{ {projectile_offset[0]}, {projectile_offset[1]} }}, "
            f"{int(enemy.get('line', enemy.get('dialogue_line', enemy.get('dialogue_line_index', -1))))}, "
            f"{on_spawn}, "
            f"{on_destroy}, "
            f"{on_hit_player}, "
            f"{resource_group_expr}, "
            f"{enemy_metasprite_expr} "
            "},"
        )

    enemies_name = f"shmup_wave_{wave_index}_enemies"
    output.append(f"constexpr gbs::ShmupEnemyData {enemies_name}[] = {{")
    output.extend(enemy_entries)
    output.append("};")
    output.append("")
    return (enemies_name, len(enemies))


def emit_shmup_player_animation_set(output, player, asset_report, base_dir=None):
    clips = player.get("animations", {})
    if not isinstance(clips, dict):
        raise SystemExit("shmup_project.player.animations precisa ser objeto")
    actions = ("idle", "fly", "bank_up", "bank_down", "shoot", "hurt", "explosion")
    if set(clips) - set(actions):
        raise SystemExit("shmup_project.player.animations contem estado desconhecido")
    if not clips:
        return "gbs::ShmupPlayerAnimationSet {}"
    expressions = []
    for action in actions:
        entry = clips.get(action)
        if entry is None:
            expressions.append("nullptr")
            continue
        description = f"shmup_project.player.animations.{action}"
        if not isinstance(entry, dict) or not entry.get("frame_indices"):
            raise SystemExit(f"{description} precisa declarar frame_indices")
        if action in ("shoot", "hurt", "explosion") and entry.get("loops", True):
            raise SystemExit(f"{description} precisa declarar loops false")
        symbol = emit_topdown_animation_frame_subset(output, "shmup_player", action, entry, asset_report, description, base_dir)
        expressions.append(f"&{symbol}")
    return f"gbs::ShmupPlayerAnimationSet {{ {', '.join(expressions)} }}"


def emit_shmup_project_data_header(shmup_project, asset_report=None, base_dir=None):
    if not isinstance(shmup_project, dict):
        raise SystemExit("shmup_project precisa ser objeto")
    waves = shmup_project.get("waves")
    if not isinstance(waves, list) or not waves:
        raise SystemExit("shmup_project.waves precisa ser lista nao vazia")

    output = [
        "#pragma once",
        "#include <stddef.h>",
        "#include <stdint.h>",
        "#include \"gbs/runtime_save_restore.hpp\"",
        "#include \"gbs/shmup.hpp\"",
    ]
    for include in merge_includes(
        string_list_from_json(shmup_project.get("includes", []), "shmup_project.includes"),
        project_auto_includes(shmup_project, asset_report),
    ):
        output.append(f"#include {cpp_string_literal(include)}")
    output.extend([
        "",
        "namespace gbastudio_shmup_project {",
        "",
    ])

    save_config = save_config_from_json(shmup_project.get("save"), "shmup_project.save", "GBSH", 0)
    emit_save_config(output, save_config)
    asset_refs = emit_project_asset_references(
        output,
        shmup_project,
        "shmup_project",
        "shmup_project",
        include_audio=True,
        asset_report=asset_report,
    )
    backgrounds_name, background_count = emit_shmup_backgrounds(output, shmup_project, asset_report)
    resource_banks_name, resource_bank_count, resource_bank_groups_name, resource_bank_group_count = emit_project_resource_banks(
        output,
        shmup_project,
        "shmup_project",
        asset_report,
    )
    emit_resource_bank_upload_sources(output, asset_report)

    dialogue_lines_name, dialogue_line_count = emit_dialogue_lines(
        output,
        shmup_project.get("dialogue_lines", []),
        "shmup_project.dialogue_lines",
    )
    actor_sprites = dialogue_emote_assets_from_json(
        shmup_project.get("actor_sprites"),
        "shmup_project.actor_sprites",
        asset_report,
    )
    emit_shmup_actor_sprites(output, actor_sprites)
    emote_assets = dialogue_emote_assets_from_json(
        shmup_project.get("emote_assets"),
        "shmup_project.emote_assets",
        asset_report,
    )
    emit_dialogue_emote_assets(output, emote_assets)

    player = shmup_project.get("player", {})
    if not isinstance(player, dict):
        raise SystemExit("shmup_project.player precisa ser objeto")
    player_position = shmup_vec_from_entry(player, "position", {"x": 112, "y": 128}, "shmup_project.player.position")
    player_size = shmup_vec_from_entry(player, "size", {"x": 16, "y": 16}, "shmup_project.player.size")
    projectile_offset = shmup_vec_from_entry(player, "projectile_offset", {"x": 6, "y": -4}, "shmup_project.player.projectile_offset")
    player_on_fire = emit_event_script(
        output,
        "shmup_player_on_fire",
        player.get("on_fire", player.get("on_shoot")),
        "shmup_project.player.on_fire",
    )
    player_metasprite = resolve_project_metasprite_symbol(
        project_actor_visual_ref(player),
        None,
        asset_report,
        "shmup_project.player.metasprite",
    )
    player_metasprite_expr = f"&{player_metasprite}" if player_metasprite else "nullptr"

    player_animations = emit_shmup_player_animation_set(output, player, asset_report, base_dir)

    projectile = shmup_project.get("projectile", shmup_project.get("player_projectile", {}))
    if not isinstance(projectile, dict):
        raise SystemExit("shmup_project.projectile precisa ser objeto")
    projectile_size = shmup_vec_from_entry(projectile, "size", {"x": 4, "y": 8}, "shmup_project.projectile.size")
    projectile_velocity = shmup_vec_from_entry(projectile, "velocity", {"x": 0, "y": -4}, "shmup_project.projectile.velocity")
    projectile_on_hit = emit_event_script(
        output,
        "shmup_player_projectile_on_hit_enemy",
        projectile.get("on_hit_enemy"),
        "shmup_project.projectile.on_hit_enemy",
    )
    projectile_metasprite = resolve_project_metasprite_symbol(
        project_actor_visual_ref(projectile),
        None,
        asset_report,
        "shmup_project.projectile.metasprite",
    )
    projectile_metasprite_expr = f"&{projectile_metasprite}" if projectile_metasprite else "nullptr"
    enemy_projectile = shmup_project.get("enemy_projectile", {})
    if not isinstance(enemy_projectile, dict):
        raise SystemExit("shmup_project.enemy_projectile precisa ser objeto")
    enemy_projectile_size = shmup_vec_from_entry(enemy_projectile, "size", {"x": 4, "y": 8}, "shmup_project.enemy_projectile.size")
    enemy_projectile_velocity = shmup_vec_from_entry(enemy_projectile, "velocity", {"x": 0, "y": 2}, "shmup_project.enemy_projectile.velocity")
    enemy_projectile_on_hit = emit_event_script(
        output,
        "shmup_enemy_projectile_on_hit_player",
        enemy_projectile.get("on_hit_player"),
        "shmup_project.enemy_projectile.on_hit_player",
    )
    enemy_projectile_metasprite = resolve_project_metasprite_symbol(
        project_actor_visual_ref(enemy_projectile),
        None,
        asset_report,
        "shmup_project.enemy_projectile.metasprite",
    )
    enemy_projectile_metasprite_expr = f"&{enemy_projectile_metasprite}" if enemy_projectile_metasprite else "nullptr"

    wave_entries = []
    max_enemy_count = 0
    for wave_index, wave in enumerate(waves):
        if not isinstance(wave, dict):
            raise SystemExit(f"shmup_project.waves[{wave_index}] precisa ser objeto")
        enemies_name, enemy_count = emit_shmup_enemies(output, wave, wave_index, asset_report)
        max_enemy_count = max(max_enemy_count, enemy_count)
        on_start = emit_event_script(
            output,
            f"shmup_wave_{wave_index}_on_start",
            wave.get("on_start"),
            f"shmup_project.waves[{wave_index}].on_start",
        )
        on_clear = emit_event_script(
            output,
            f"shmup_wave_{wave_index}_on_clear",
            wave.get("on_clear"),
            f"shmup_project.waves[{wave_index}].on_clear",
        )
        resource_group = wave.get("resource_bank_group", wave.get("bank_group"))
        resource_group_expr = cpp_string_literal(resource_group) if isinstance(resource_group, str) and resource_group else "nullptr"
        wave_entries.append(
            "    gbs::ShmupWaveData { "
            f"{cpp_string_literal(wave.get('name', f'wave_{wave_index}'))}, "
            f"{enemies_name}, "
            f"{enemy_count}, "
            f"static_cast<uint16_t>({int(wave.get('start_frame', 0))}), "
            f"{int(wave.get('next_wave', wave.get('next_wave_index', -1)))}, "
            f"{on_start}, "
            f"{on_clear}, "
            f"{resource_group_expr}, "
            f"static_cast<uint8_t>({int(wave.get('player_speed', wave.get('player_speed_pixels_per_frame', 0)))}), "
            f"static_cast<uint8_t>({int(wave.get('fire_cooldown', wave.get('fire_cooldown_frames', 0)))}) "
            "},"
        )
    output.append("constexpr gbs::ShmupWaveData waves[] = {")
    output.extend(wave_entries)
    output.append("};")
    output.append(f"constexpr size_t max_enemy_count = {max_enemy_count};")
    output.append("")
    scene_composition = shmup_scene_composition_literal(
        shmup_project,
        "shmup_project",
        asset_report,
        output,
    )

    output.extend([
        "const gbs::ShmupProjectData project {",
        f"    {asset_refs['bg_palettes'][0]},",
        f"    {asset_refs['bg_palettes'][1]},",
        f"    {asset_refs['tile_assets'][0]},",
        f"    {asset_refs['tile_assets'][1]},",
        f"    {backgrounds_name},",
        f"    {background_count},",
        f"    {int(shmup_project.get('background', shmup_project.get('background_index', -1)))},",
        "    {",
        f"        gbs::Vec2i {{ {player_position[0]}, {player_position[1]} }},",
        f"        gbs::Vec2i {{ {player_size[0]}, {player_size[1]} }},",
        f"        static_cast<uint8_t>({int(player.get('speed', player.get('speed_pixels_per_frame', 2)))}),",
        f"        static_cast<uint8_t>({int(player.get('fire_cooldown', player.get('fire_cooldown_frames', 10)))}),",
        f"        gbs::Vec2i {{ {projectile_offset[0]}, {projectile_offset[1]} }},",
        f"        {player_on_fire},",
        f"        {player_metasprite_expr},",
        f"        {player_animations}",
        "    },",
        "    {",
        f"        gbs::Vec2i {{ {projectile_size[0]}, {projectile_size[1]} }},",
        f"        gbs::Vec2i {{ {projectile_velocity[0]}, {projectile_velocity[1]} }},",
        f"        static_cast<uint8_t>({int(projectile.get('max_active', 6))}),",
        f"        {projectile_on_hit},",
        f"        {projectile_metasprite_expr}",
        "    },",
        "    {",
        f"        gbs::Vec2i {{ {enemy_projectile_size[0]}, {enemy_projectile_size[1]} }},",
        f"        gbs::Vec2i {{ {enemy_projectile_velocity[0]}, {enemy_projectile_velocity[1]} }},",
        f"        static_cast<uint8_t>({int(enemy_projectile.get('max_active', 8))}),",
        f"        {enemy_projectile_on_hit},",
        f"        {enemy_projectile_metasprite_expr}",
        "    },",
        "    waves,",
        f"    {len(waves)},",
        f"    {int(shmup_project.get('initial_wave', 0))},",
        f"    {dialogue_lines_name},",
        f"    {dialogue_line_count},",
        f"    {asset_refs['sfx_assets'][0]},",
        f"    {asset_refs['sfx_assets'][1]},",
        f"    {asset_refs['music_assets'][0]},",
        f"    {asset_refs['music_assets'][1]},",
        "    nullptr,",
        "    0,",
        f"    {asset_refs['pcm_assets'][0]},",
        f"    {asset_refs['pcm_assets'][1]},",
        f"    {asset_refs['tracker_assets'][0]},",
        f"    {asset_refs['tracker_assets'][1]},",
        f"    {resource_banks_name},",
        f"    {resource_bank_count},",
        f"    {resource_bank_groups_name},",
        f"    {resource_bank_group_count},",
        f"    {asset_refs['obj_palettes'][0]},",
        f"    {asset_refs['obj_palettes'][1]},",
        "    shmup_actor_sprites,",
        "    shmup_actor_sprite_count,",
        "    dialogue_emote_assets,",
        "    dialogue_emote_asset_count,",
        f"    {'true' if bool(shmup_project.get('score_enabled', True)) else 'false'},",
        f"    {'true' if bool(shmup_project.get('high_score_enabled', True)) else 'false'},",
        f"    static_cast<uint16_t>({max(0, min(65535, int(shmup_project.get('initial_score', 0))))}),",
        f"    static_cast<uint8_t>({max(0, min(9, int(shmup_project.get('initial_lives', 3))))}),",
        f"    {'true' if bool(shmup_project.get('waves_enabled', True)) else 'false'},",
        f"    static_cast<uint8_t>({max(1, min(64, int(shmup_project.get('max_waves', 64))))}),",
        f"    {'true' if bool(shmup_project.get('loop_waves', False)) else 'false'},",
        f"    {scene_composition}",
        "};",
        "",
        "} // namespace gbastudio_shmup_project",
        "",
    ])
    return "\n".join(output)


def topdown_camera_mode_from_json(value):
    mode = str(value).strip().lower().replace("-", "_")
    mapping = {
        "project_default": "ProjectDefault",
        "default": "ProjectDefault",
        "follow": "Follow",
        "fixed": "Fixed",
    }
    if mode not in mapping:
        raise SystemExit(f"camera_mode desconhecido: {value}")
    return mapping[mode]


def topdown_actor_direction_from_json(value):
    direction = str(value).strip().lower().replace("-", "_")
    mapping = {
        "down": "Down",
        "up": "Up",
        "left": "Left",
        "right": "Right",
        "down_left": "DownLeft",
        "down_right": "DownRight",
        "up_left": "UpLeft",
        "up_right": "UpRight",
    }
    if direction not in mapping:
        raise SystemExit(f"actor direction desconhecida: {value}")
    return mapping[direction]


def background_layer_from_json(value):
    layer = str(value).strip().lower().replace("-", "_")
    mapping = {
        "0": "BG0",
        "bg0": "BG0",
        "1": "BG1",
        "bg1": "BG1",
        "2": "BG2",
        "bg2": "BG2",
        "3": "BG3",
        "bg3": "BG3",
    }
    if layer not in mapping:
        raise SystemExit(f"background layer desconhecida: {value}")
    return mapping[layer]


def resource_pool_kind_from_json(value):
    kind = str(value).strip().lower().replace("-", "_")
    mapping = {
        "bg_tiles": "BgTiles",
        "bgtiles": "BgTiles",
        "background_tiles": "BgTiles",
        "obj_tiles": "ObjTiles",
        "objtiles": "ObjTiles",
        "object_tiles": "ObjTiles",
        "sprite_tiles": "ObjTiles",
        "bg_palette": "BgPalette",
        "bg_palette_colors": "BgPalette",
        "background_palette": "BgPalette",
        "obj_palette": "ObjPalette",
        "obj_palette_colors": "ObjPalette",
        "object_palette": "ObjPalette",
        "sprite_palette": "ObjPalette",
        "oam": "OamSprites",
        "oam_sprites": "OamSprites",
        "sprites": "OamSprites",
    }
    if kind not in mapping:
        raise SystemExit(f"resource bank kind desconhecido: {value}")
    return mapping[kind]


def emit_resource_bank_array(output, array_name, banks, description):
    if not banks:
        return "nullptr", 0
    output.append(f"constexpr gbs::ResourceBank {array_name}[] = {{")
    for index, bank in enumerate(banks):
        if not isinstance(bank, dict):
            raise SystemExit(f"{description}[{index}] precisa ser objeto")
        kind = resource_pool_kind_from_json(bank.get("kind", "bg_tiles"))
        start_value = bank.get("start", "auto")
        if isinstance(start_value, str):
            if start_value.strip().lower() not in ("auto", "automatic"):
                raise SystemExit(f"{description}[{index}].start invalido: {start_value}")
            start = "gbs::automatic_resource_bank_start"
        else:
            start = str(require_int(start_value, f"{description}[{index}].start", 0, 0xFFFE))
        count = require_int(bank.get("count", 0), f"{description}[{index}].count", 1, 1024)
        alignment = require_int(bank.get("alignment", 1), f"{description}[{index}].alignment", 0, 1024)
        name = cpp_string_literal(bank.get("name", f"{array_name}_{index}"))
        output.append(
            "    gbs::ResourceBank { "
            f"gbs::ResourcePoolKind::{kind}, "
            f"{start}, "
            f"{count}, "
            f"{alignment}, "
            f"{name}"
            " },"
        )
    output.append("};")
    output.append("")
    return array_name, len(banks)


def asset_pack_symbol_map(asset_report):
    if asset_report is None:
        return {}
    export_plan = asset_report.get("export_plan", {})
    headers = export_plan.get("headers", [])
    if not isinstance(headers, list):
        return {}
    symbols = {}
    for header in headers:
        if not isinstance(header, dict):
            continue
        if bool(header.get("omitted", False)):
            continue
        if (not bool(header.get("generate", True)) and not bool(header.get("inputs", []))
                and header.get("kind") != "palette"):
            continue
        asset_id = header.get("id")
        symbol = header.get("symbol")
        if isinstance(asset_id, str) and asset_id and isinstance(symbol, str) and symbol:
            symbols[asset_id] = symbol
    return symbols


def resource_bank_upload_source_symbol(symbol, resource):
    mapping = {
        "bg_tiles": f"{symbol}_tiles",
        "obj_tiles": f"{symbol}_tiles",
        "bg_palette_colors": f"{symbol}_palette",
        "obj_palette_colors": f"{symbol}_palette",
        "affine_bg_tiles": f"{symbol}_affine_tiles",
    }
    return mapping.get(resource)


def resource_bank_upload_sources_from_asset_report(asset_report, asset_ids=None):
    if asset_report is None:
        return []
    plan = asset_report.get("resource_bank_plan", [])
    if not isinstance(plan, list):
        return []
    symbols = asset_pack_symbol_map(asset_report)
    sources = []
    seen = set()
    for bank in plan:
        if not isinstance(bank, dict):
            continue
        bank_name = bank.get("name")
        asset_id = bank.get("asset")
        if asset_ids is not None and asset_id not in asset_ids:
            continue
        resource = bank.get("resource")
        if not isinstance(bank_name, str) or not isinstance(asset_id, str) or not isinstance(resource, str):
            continue
        symbol = symbols.get(asset_id)
        source_symbol = resource_bank_upload_source_symbol(symbol, resource) if symbol else None
        if source_symbol is None or bank_name in seen:
            continue
        seen.add(bank_name)
        if bank.get("source_offset"):
            source_symbol = f"{source_symbol} + {int(bank['source_offset'])}"
        sources.append({
            "bank_name": bank_name,
            "source": source_symbol,
        })
    return sources


def emit_resource_bank_upload_sources(output, asset_report, asset_ids=None):
    sources = resource_bank_upload_sources_from_asset_report(asset_report, asset_ids)
    if not sources:
        output.append("constexpr const gbs::ResourceBankUploadSource* resource_bank_upload_sources = nullptr;")
        output.append("constexpr size_t resource_bank_upload_source_count = 0;")
        output.append("")
        return "nullptr", 0

    output.append("constexpr gbs::ResourceBankUploadSource resource_bank_upload_sources[] = {")
    for source in sources:
        output.append(
            "    gbs::ResourceBankUploadSource { "
            f"{cpp_string_literal(source['bank_name'])}, "
            f"{source['source']} "
            "},"
        )
    output.append("};")
    output.append(f"constexpr size_t resource_bank_upload_source_count = {len(sources)};")
    output.append("")
    return "resource_bank_upload_sources", len(sources)


def project_resource_banks_from_json(project, description, asset_report=None):
    banks = project.get("resource_banks", [])
    if banks is None:
        banks = []
    if isinstance(banks, str):
        source = banks.strip().lower().replace("-", "_")
        if source != "asset_pack":
            raise SystemExit(f"{description}.resource_banks string invalida: {banks}")
        if asset_report is None:
            raise SystemExit(f"{description}.resource_banks='asset_pack' exige asset_pack no manifesto")
        banks = asset_report.get("resource_bank_plan", [])
        if not isinstance(banks, list):
            raise SystemExit("asset_pack_report.resource_bank_plan precisa ser lista")
    if not isinstance(banks, list):
        raise SystemExit(f"{description}.resource_banks precisa ser lista ou 'asset_pack'")
    return banks


def project_resource_bank_groups_from_json(project, banks, description, asset_report=None):
    groups = project.get("resource_bank_groups", None)
    if groups is None and isinstance(project.get("resource_banks", []), str) and asset_report is not None:
        groups = asset_report.get("resource_bank_groups", [])
    if groups is None:
        return []
    if not isinstance(groups, list):
        raise SystemExit(f"{description}.resource_bank_groups precisa ser lista")
    normalized = []
    for group_index, group in enumerate(groups):
        if not isinstance(group, dict):
            raise SystemExit(f"{description}.resource_bank_groups[{group_index}] precisa ser objeto")
        group_name = str(group.get("name", f"group_{group_index}"))
        group_banks = group.get("banks", None)
        if group_banks is None:
            bank_indexes = group.get("bank_indexes", [])
            if not isinstance(bank_indexes, list):
                raise SystemExit(f"{description}.resource_bank_groups[{group_index}].bank_indexes precisa ser lista")
            group_banks = []
            for bank_index_value in bank_indexes:
                if not banks:
                    raise SystemExit(f"{description}.resource_bank_groups[{group_index}].bank_indexes exige resource_banks")
                bank_index = require_int(bank_index_value, f"{description}.resource_bank_groups[{group_index}].bank_indexes[]", 0, len(banks) - 1)
                group_banks.append(banks[bank_index])
        if not isinstance(group_banks, list):
            raise SystemExit(f"{description}.resource_bank_groups[{group_index}].banks precisa ser lista")
        normalized.append({
            "name": group_name,
            "banks": group_banks,
        })
    return normalized


def emit_project_resource_bank_groups(output, project, banks, description, asset_report=None):
    groups = project_resource_bank_groups_from_json(project, banks, description, asset_report)
    if not groups:
        return "nullptr", 0

    group_entries = []
    for group_index, group in enumerate(groups):
        group_identifier = pack_safe_identifier(group["name"] or f"group_{group_index}")
        group_bank_name, group_bank_count = emit_resource_bank_array(
            output,
            f"resource_bank_group_{group_identifier}_banks",
            group["banks"],
            f"{description}.resource_bank_groups[{group_index}].banks",
        )
        group_entries.append(
            "    gbs::ResourceBankGroup { "
            f"{cpp_string_literal(group['name'])}, "
            f"{group_bank_name}, "
            f"{group_bank_count} "
            "},"
        )

    output.append("constexpr gbs::ResourceBankGroup resource_bank_groups[] = {")
    output.extend(group_entries)
    output.append("};")
    output.append("")
    return "resource_bank_groups", len(groups)


def emit_project_resource_banks(output, project, description, asset_report=None):
    banks = project_resource_banks_from_json(project, description, asset_report)
    banks_name, bank_count = emit_resource_bank_array(output, "resource_banks", banks, f"{description}.resource_banks")
    groups_name, group_count = emit_project_resource_bank_groups(output, project, banks, description, asset_report)
    return banks_name, bank_count, groups_name, group_count


def emit_topdown_resource_banks(output, topdown_project, asset_report=None):
    return emit_project_resource_banks(output, topdown_project, "topdown_project", asset_report)


def video_composition_literal(project, description, asset_report=None):
    video = project.get("video", {})
    if video is None:
        video = {}
    if not isinstance(video, dict):
        raise SystemExit(f"{description}.video precisa ser objeto")
    mode = max(0, min(5, int(video.get("display_mode", 0))))
    affine = video.get("affine")
    affine_enabled = isinstance(affine, dict) and mode in (1, 2)
    if affine is None:
        affine = {}
    if not isinstance(affine, dict):
        raise SystemExit(f"{description}.video.affine precisa ser objeto ou null")
    affine_layer = background_layer_from_json(affine.get("layer", "bg2"))
    if affine_layer not in ("BG2", "BG3"):
        raise SystemExit(f"{description}.video.affine.layer precisa ser BG2 ou BG3")
    transform = [
        int(affine.get("pa", 256)),
        int(affine.get("pb", 0)),
        int(affine.get("pc", 0)),
        int(affine.get("pd", 256)),
        int(affine.get("reference_x_8", 0)),
        int(affine.get("reference_y_8", 0)),
    ]
    affine_asset = affine.get("asset")
    affine_tiles = "nullptr"
    affine_tilemap = "nullptr"
    affine_palette = "nullptr"
    if isinstance(affine_asset, str) and affine_asset:
        affine_tiles = f"&{resolve_project_asset_symbol(affine_asset, 'affine_tile_asset', asset_report, f'{description}.video.affine.asset')}"
        affine_tilemap = f"&{resolve_project_asset_symbol(affine_asset, 'affine_tilemap_asset', asset_report, f'{description}.video.affine.asset')}"
        affine_palette = f"&{resolve_project_asset_symbol(affine_asset, 'palette_asset', asset_report, f'{description}.video.affine.asset')}"
    bitmap = video.get("bitmap")
    if bitmap is None:
        bitmap = {}
    if not isinstance(bitmap, dict):
        raise SystemExit(f"{description}.video.bitmap precisa ser objeto ou null")
    bitmap_asset = bitmap.get("asset")
    bitmap16 = "nullptr"
    bitmap8 = "nullptr"
    bitmap_palette = "nullptr"
    if isinstance(bitmap_asset, str) and bitmap_asset:
        bitmap_symbol = resolve_project_asset_symbol(bitmap_asset, "bitmap_asset", asset_report, f"{description}.video.bitmap.asset")
        if mode == 4:
            bitmap8 = f"&{bitmap_symbol}"
            palette_symbol = resolve_project_asset_symbol(bitmap_asset, "palette_asset", asset_report, f"{description}.video.bitmap.asset")
            bitmap_palette = f"&{palette_symbol}"
        elif mode in (3, 5):
            bitmap16 = f"&{bitmap_symbol}"
    page = max(0, min(1, int(bitmap.get("page", 0))))
    return (
        "gbs::VideoComposition { "
        f"static_cast<gbs::DisplayMode>({mode}), "
        f"{'true' if affine_enabled else 'false'}, "
        f"gbs::BackgroundLayer::{affine_layer}, "
        f"gbs::AffineBgTransform {{ {', '.join(str(value) for value in transform)} }}, "
        f"{affine_tiles}, {affine_tilemap}, {affine_palette}, "
        f"{bitmap16}, {bitmap8}, {bitmap_palette}, static_cast<uint8_t>({page}), "
        f"{'true' if bool(affine.get('wrap', True)) else 'false'} "
        "}"
    )


def room_video_composition_literal(room, description, asset_report=None):
    video = room.get("video") if isinstance(room, dict) else None
    if video is None:
        return video_composition_literal({}, f"{description}.video", asset_report)
    if not isinstance(video, dict):
        raise SystemExit(f"{description}.video precisa ser objeto")
    return video_composition_literal({"video": video}, description, asset_report)


def emit_topdown_backgrounds(output, topdown_project, asset_report=None):
    backgrounds = topdown_project.get("backgrounds", [])
    if backgrounds is None:
        backgrounds = []
    if not isinstance(backgrounds, list):
        raise SystemExit("topdown_project.backgrounds precisa ser lista")
    if not backgrounds:
        return "nullptr", 0

    lines = []
    for index, background in enumerate(backgrounds):
        if not isinstance(background, dict):
            raise SystemExit(f"topdown_project.backgrounds[{index}] precisa ser objeto")
        layer = background_layer_from_json(background.get("layer", "bg1"))
        tilemap = background.get("tilemap", background.get("tilemap_asset"))
        compressed_tilemap = background.get("compressed_tilemap", background.get("compressed_tilemap_asset"))
        if tilemap is not None and not isinstance(tilemap, str):
            raise SystemExit(f"topdown_project.backgrounds[{index}].tilemap precisa ser string")
        if compressed_tilemap is not None and not isinstance(compressed_tilemap, str):
            raise SystemExit(f"topdown_project.backgrounds[{index}].compressed_tilemap precisa ser string")
        if tilemap is None and compressed_tilemap is None:
            raise SystemExit(f"topdown_project.backgrounds[{index}] precisa declarar tilemap ou compressed_tilemap")
        scroll = vec2_from_json(
            background.get("scroll", background.get("scroll_pixels", {"x": 0, "y": 0})),
            f"topdown_project.backgrounds[{index}].scroll",
        )
        parallax = vec2_from_json(
            background.get("parallax", background.get("parallax_256", {"x": 256, "y": 256})),
            f"topdown_project.backgrounds[{index}].parallax",
        )
        tilemap_expr = (
            resolve_project_asset_symbol(tilemap, "tilemap", asset_report, f"topdown_project.backgrounds[{index}].tilemap")
            if tilemap is not None
            else "gbs::TileMapAsset { nullptr, 0, 0 }"
        )
        if compressed_tilemap is not None:
            compressed_member = "lz77_tilemap" if str(compressed_tilemap).endswith("_lz77") else "rle_tilemap"
            compressed_symbol = resolve_project_asset_symbol(
                compressed_tilemap,
                compressed_member,
                asset_report,
                f"topdown_project.backgrounds[{index}].compressed_tilemap",
            )
            compressed_expr = f"&{compressed_symbol}"
        else:
            compressed_expr = "nullptr"
        lines.append(
            "    gbs::TopDownBackgroundData {\n"
            f"        gbs::BackgroundLayer::{layer},\n"
            f"        {tilemap_expr},\n"
            f"        {compressed_expr},\n"
            f"        gbs::Vec2i {{ {scroll[0]}, {scroll[1]} }},\n"
            f"        gbs::Vec2i {{ {parallax[0]}, {parallax[1]} }}\n"
            "    },"
        )

    output.append("constexpr gbs::TopDownBackgroundData backgrounds[] = {")
    output.extend(lines)
    output.append("};")
    output.append("")
    return "backgrounds", len(backgrounds)


def topdown_npc_movement_kind_from_json(value):
    kind = str(value).strip().lower().replace("-", "_")
    mapping = {
        "none": "None",
        "patrol_horizontal": "PatrolHorizontal",
        "patrol_vertical": "PatrolVertical",
        "wander_box": "WanderBox",
        "follow_player": "FollowPlayer",
        "path_to_point": "PathToPoint",
    }
    if kind not in mapping:
        raise SystemExit(f"npc movement kind desconhecido: {value}")
    return mapping[kind]


def topdown_trigger_kind_from_json(value):
    kind = str(value).strip().lower().replace("-", "_")
    mapping = {
        "standard": "Standard",
        "water": "Water",
        "damage": "Damage",
    }
    if kind not in mapping:
        raise SystemExit(f"trigger kind desconhecido: {value}")
    return mapping[kind]


def emit_topdown_npc_movement(movement, room_index, npc_index):
    if movement is None:
        movement = {}
    if not isinstance(movement, dict):
        raise SystemExit(f"topdown_project.rooms[{room_index}].npcs[{npc_index}].movement precisa ser objeto")
    kind = topdown_npc_movement_kind_from_json(movement.get("kind", "none"))
    bounds = rect_from_json(
        movement.get("bounds", {"x": 0, "y": 0, "width": 0, "height": 0}),
        f"topdown_project.rooms[{room_index}].npcs[{npc_index}].movement.bounds",
    )
    target = vec2_from_json(
        movement.get("target", {"x": 0, "y": 0}),
        f"topdown_project.rooms[{room_index}].npcs[{npc_index}].movement.target",
    )
    max_search_tiles = int(movement.get("max_search_tiles", 32))
    step_interval_frames = int(movement.get("step_interval_frames", 1))
    return (
        "gbs::TopDownNpcMovementData {\n"
        f"            gbs::TopDownNpcMovementKind::{kind},\n"
        f"            gbs::Rect {{ {bounds[0]}, {bounds[1]}, {bounds[2]}, {bounds[3]} }},\n"
        f"            gbs::Vec2i {{ {target[0]}, {target[1]} }},\n"
        f"            {max_search_tiles},\n"
        f"            {step_interval_frames}\n"
        "        }"
    )


def emit_topdown_affine_obj(output, value, description, symbol):
    if value is None:
        return "gbs::TopDownAffineObjectData {}"
    if not isinstance(value, dict):
        raise SystemExit(f"{description} precisa ser objeto")
    enabled = bool(value.get("enabled", True))
    if not enabled:
        return "gbs::TopDownAffineObjectData {}"
    matrix_index = int(value.get("matrix_index", value.get("matrixIndex", 0)))
    if matrix_index < 0 or matrix_index >= 32:
        raise SystemExit(f"{description}.matrix_index precisa estar entre 0 e 31")
    values = []
    for key, fallback in (("pa", 256), ("pb", 0), ("pc", 0), ("pd", 256)):
        number = int(value.get(key, fallback))
        if number < -32768 or number > 32767:
            raise SystemExit(f"{description}.{key} precisa ser um inteiro assinado de 16 bits")
        values.append(number)

    easing_names = {
        "linear": "Linear",
        "ease_in": "EaseIn",
        "easeout": "EaseOut",
        "ease_out": "EaseOut",
        "easein": "EaseIn",
        "ease_in_out": "EaseInOut",
        "easeinout": "EaseInOut",
    }
    easing_value = str(value.get("easing", "linear")).strip().lower().replace("-", "_")
    if easing_value not in easing_names:
        raise SystemExit(f"{description}.easing precisa ser linear, ease_in, ease_out ou ease_in_out")

    raw_keyframes = value.get("keyframes", [])
    if raw_keyframes is None:
        raw_keyframes = []
    if not isinstance(raw_keyframes, list):
        raise SystemExit(f"{description}.keyframes precisa ser lista")
    keyframe_name = "nullptr"
    keyframe_count = 0
    keyframe_lines = []
    previous_frame = -1
    for keyframe_index, keyframe in enumerate(raw_keyframes):
        if not isinstance(keyframe, dict):
            raise SystemExit(f"{description}.keyframes[{keyframe_index}] precisa ser objeto")
        frame = keyframe.get("frame")
        if not isinstance(frame, int) or isinstance(frame, bool) or frame < 0 or frame > 0xFFFFFFFF or frame <= previous_frame:
            raise SystemExit(f"{description}.keyframes[{keyframe_index}].frame invalido ou fora de ordem")
        matrix_values = []
        for key, fallback in (("pa", 256), ("pb", 0), ("pc", 0), ("pd", 256)):
            number = keyframe.get(key, fallback)
            if not isinstance(number, int) or isinstance(number, bool) or number < -32768 or number > 32767:
                raise SystemExit(f"{description}.keyframes[{keyframe_index}].{key} precisa ser um inteiro assinado de 16 bits")
            matrix_values.append(number)
        keyframe_lines.append(
            f"    {{ {frame}, gbs::AffineMatrix {{ {matrix_values[0]}, {matrix_values[1]}, {matrix_values[2]}, {matrix_values[3]} }} }},"
        )
        previous_frame = frame
    if keyframe_lines:
        keyframe_name = f"{symbol}_affine_keyframes"
        keyframe_count = len(keyframe_lines)
        output.append(f"constexpr gbs::AffineMatrixKeyframe {keyframe_name}[] = {{")
        output.extend(keyframe_lines)
        output.append("};")
        output.append("")
    return (
        "gbs::TopDownAffineObjectData { "
        f"true, {'true' if bool(value.get('double_size', value.get('doubleSize', False))) else 'false'}, "
        f"static_cast<uint8_t>({matrix_index}), "
        f"gbs::AffineSpriteTransform {{ {values[0]}, {values[1]}, {values[2]}, {values[3]} }}, "
        f"gbs::Easing::{easing_names[easing_value]}, {keyframe_name}, {keyframe_count} "
        "}"
    )


def emit_topdown_room_metadata(room, room_index):
    metadata = room.get("metadata", {})
    if metadata is None:
        metadata = {}
    if not isinstance(metadata, dict):
        raise SystemExit(f"topdown_project.rooms[{room_index}].metadata precisa ser objeto")

    camera_mode = topdown_camera_mode_from_json(metadata.get("camera_mode", room.get("camera_mode", "project_default")))
    camera_position = vec2_from_json(
        metadata.get("camera_position", room.get("camera_position", {"x": 0, "y": 0})),
        f"topdown_project.rooms[{room_index}].metadata.camera_position",
    )
    player_start_value = metadata.get("player_start", room.get("player_start", None))
    has_player_start = player_start_value is not None
    player_start = vec2_from_json(
        player_start_value if has_player_start else {"x": 0, "y": 0},
        f"topdown_project.rooms[{room_index}].metadata.player_start",
    )
    music_index_value = metadata.get("music_index", room.get("music_index", None))
    has_music = music_index_value is not None
    music_index = int(music_index_value) if has_music else -1
    stop_music = bool(metadata.get("stop_music", room.get("stop_music", False)))
    backdrop_color_value = metadata.get("backdrop_color", room.get("backdrop_color", None))
    has_backdrop_color = backdrop_color_value is not None
    backdrop_color = int(backdrop_color_value) if has_backdrop_color else 0
    camera_bounds_value = metadata.get("camera_bounds", room.get("camera_bounds", None))
    has_camera_bounds = camera_bounds_value is not None
    camera_bounds = rect_from_json(
        camera_bounds_value if has_camera_bounds else {"x": 0, "y": 0, "width": 0, "height": 0},
        f"topdown_project.rooms[{room_index}].metadata.camera_bounds",
    )

    return (
        "gbs::TopDownRoomMetadata {\n"
        f"            gbs::TopDownCameraMode::{camera_mode},\n"
        f"            gbs::Vec2i {{ {camera_position[0]}, {camera_position[1]} }},\n"
        f"            {'true' if has_player_start else 'false'},\n"
        f"            gbs::Vec2i {{ {player_start[0]}, {player_start[1]} }},\n"
        f"            {'true' if has_music else 'false'},\n"
        f"            {music_index},\n"
        f"            {'true' if stop_music else 'false'},\n"
        f"            {'true' if has_backdrop_color else 'false'},\n"
        f"            static_cast<uint16_t>({backdrop_color}),\n"
        f"            {'true' if has_camera_bounds else 'false'},\n"
        f"            gbs::Rect {{ {camera_bounds[0]}, {camera_bounds[1]}, {camera_bounds[2]}, {camera_bounds[3]} }}\n"
        "        }"
    )


def emit_topdown_project_data_header(topdown_project, asset_report=None, base_dir=None):
    if not isinstance(topdown_project, dict):
        raise SystemExit("topdown_project precisa ser objeto")

    rooms = topdown_project.get("rooms")
    if not isinstance(rooms, list) or not rooms:
        raise SystemExit("topdown_project.rooms precisa ser lista nao vazia")
    initial_room = int(topdown_project.get("initial_room", 0))
    if initial_room < 0 or initial_room >= len(rooms):
        raise SystemExit("topdown_project.initial_room precisa apontar para rooms[]")
    video_literal = video_composition_literal(topdown_project, "topdown_project", asset_report)

    player = topdown_project.get("player", {})
    if not isinstance(player, dict):
        raise SystemExit("topdown_project.player precisa ser objeto quando informado")
    player_position = vec2_from_json(player.get("position", {"x": 8, "y": 8}), "topdown_project.player.position")
    player_size = vec2_from_json(player.get("size", {"x": 16, "y": 16}), "topdown_project.player.size")
    player_collision_offset = vec2_from_json(
        player.get("collision_offset", {"x": 0, "y": 0}),
        "topdown_project.player.collision_offset",
    )
    player_speed = int(player.get("speed", 1))
    player_direction = topdown_actor_direction_from_json(player.get("direction", "down"))
    player_metasprite = resolve_project_metasprite_symbol(
        player.get("metasprite"),
        "generated_player_metasprite",
        asset_report,
        "topdown_project.player.metasprite",
    )
    player_animation = resolve_project_animation_symbol(
        player.get("animation"),
        asset_report,
        "topdown_project.player.animation",
    )
    camera = topdown_project.get("camera", {})
    if not isinstance(camera, dict):
        raise SystemExit("topdown_project.camera precisa ser objeto quando informado")
    camera_position = vec2_from_json(camera.get("position", {"x": 0, "y": 0}), "topdown_project.camera.position")
    camera_follow = bool(camera.get("follow_player", True))
    camera_zoom_x256 = int(camera.get("zoom_x256", 256))
    if camera_zoom_x256 != 256:
        raise SystemExit("topdown_project.camera.zoom_x256 must remain 256 (100%) until scaled top-down rendering is implemented")
    backdrop_color = int(topdown_project.get("backdrop_color", 0))
    save_config = save_config_from_json(topdown_project.get("save"), "topdown_project.save", "GBTD", 0, 512, 3)
    dialogue_ui = dialogue_ui_from_json(topdown_project.get("dialogue_ui"), "topdown_project.dialogue_ui")
    dialogue_ui_literal = emit_dialogue_ui_literal(dialogue_ui)
    dialogue_ui_json = topdown_project.get("dialogue_ui")
    hud_box_config = hud_box_config_from_json(dialogue_ui_json)
    dialogue_box_skin = dialogue_box_skin_from_json(
        dialogue_ui_json.get("box_skin") if isinstance(dialogue_ui_json, dict) else None,
        base_dir,
        "topdown_project.dialogue_ui.box_skin",
    )
    hud_box_skin = dialogue_box_skin_from_json(
        dialogue_ui_json.get("hud_skin") if isinstance(dialogue_ui_json, dict) else None,
        base_dir,
        "topdown_project.dialogue_ui.hud_skin",
    )
    dialogue_font = dialogue_font_from_json(
        dialogue_ui_json.get("font_image") if isinstance(dialogue_ui_json, dict) else None,
        base_dir,
        "topdown_project.dialogue_ui.font_image",
    )
    dialogue_choice_selector = dialogue_choice_selector_from_json(
        dialogue_ui_json.get("selector_skin") if isinstance(dialogue_ui_json, dict) else None,
        base_dir,
        "topdown_project.dialogue_ui.selector_skin",
        dialogue_box_skin,
    )

    includes = merge_includes(
        string_list_from_json(topdown_project.get("includes", []), "topdown_project.includes"),
        project_auto_includes(topdown_project, asset_report),
    )
    emit_player_animation_fallback = bool(player.get("emit_animation_fallback", not includes))
    if player_animation is None and emit_player_animation_fallback:
        player_animation = "player_sprite_animation"
    player_animation_expr = f"&{player_animation}" if player_animation is not None else "nullptr"
    player_uses_animation_fallback = emit_player_animation_fallback and player_animation == "player_sprite_animation"

    dialogue_lines = dialogue_line_entries_from_json(
        topdown_project.get("dialogue_lines", []),
        "topdown_project.dialogue_lines",
    )

    output = [
        "#pragma once",
        "",
        '#include "gbs/engine.hpp"',
        '#include "gbs/project.hpp"',
    ]
    for include in includes:
        output.append(f'#include "{include}"')
    output.extend([
        "",
        "namespace gbastudio_project {",
        "",
        "constexpr gbs::MetaSpritePart generated_player_parts[] = {",
        "    gbs::MetaSpritePart { 0, 0, 0, 0, false, false }",
        "};",
        "constexpr gbs::MetaSprite generated_player_metasprite { generated_player_parts, 1 };",
        "",
    ])
    player_affine_obj = emit_topdown_affine_obj(
        output,
        player.get("affine_obj"),
        "topdown_project.player.affine_obj",
        "topdown_player",
    )
    if player_uses_animation_fallback:
        output.extend([
            "constexpr gbs::SpriteAnimationFrame player_sprite_animation_frames[] = {",
            "    gbs::SpriteAnimationFrame { generated_player_metasprite, 12 }",
            "};",
            "constexpr gbs::SpriteAnimation player_sprite_animation { player_sprite_animation_frames, 1, true };",
            "",
        ])
    player_animation_table = "nullptr"
    player_animation_count = 0
    player_animation_lookup = {}
    if isinstance(player.get("animations"), list) and player.get("animations"):
        player_animation_expr, player_animation_table, player_animation_count, player_animation_lookup = emit_topdown_npc_animation_table(
            output,
            "player",
            player,
            asset_report,
            "topdown_project.player",
            base_dir,
        )
    raw_actor_sprites = topdown_project.get("actor_sprites", [])
    if raw_actor_sprites is None:
        raw_actor_sprites = []
    if not isinstance(raw_actor_sprites, list):
        raise SystemExit("topdown_project.actor_sprites precisa ser lista")
    actor_sprite_entries = []
    for index, actor_sprite in enumerate(raw_actor_sprites):
        description = f"topdown_project.actor_sprites[{index}]"
        if not isinstance(actor_sprite, dict):
            raise SystemExit(f"{description} precisa ser objeto")
        if not isinstance(actor_sprite.get("name"), str) or not actor_sprite.get("name"):
            raise SystemExit(f"{description}.name precisa ser texto")
        if actor_sprite.get("metasprite") is None:
            raise SystemExit(f"{description}.metasprite precisa referenciar uma imagem")
        metasprite = resolve_project_metasprite_symbol(
            actor_sprite.get("metasprite"),
            None,
            asset_report,
            f"{description}.metasprite",
        )
        animation_expr, animation_table, animation_count, _animation_lookup = emit_topdown_npc_animation_table(
            output,
            f"topdown_actor_sprite_{index}",
            actor_sprite,
            asset_report,
            description,
            base_dir,
        )
        actor_sprite_entries.append(
            "    gbs::TopDownActorSpriteData { "
            f"&{metasprite}, {animation_expr}, {animation_table}, {animation_count} }},"
        )
    actor_sprites_name = "nullptr"
    if actor_sprite_entries:
        actor_sprites_name = "topdown_actor_sprites"
        output.append(f"constexpr gbs::TopDownActorSpriteData {actor_sprites_name}[] = {{")
        output.extend(actor_sprite_entries)
        output.append("};")
        output.append("")
    player_on_start = emit_event_script(
        output,
        "topdown_player_on_start",
        player.get("on_start"),
        "topdown_project.player.on_start",
        animation_lookup=player_animation_lookup,
    )
    player_on_update = emit_event_script(
        output,
        "topdown_player_on_update",
        player.get("on_update"),
        "topdown_project.player.on_update",
        animation_lookup=player_animation_lookup,
    )
    asset_refs = emit_project_asset_references(output, topdown_project, "topdown_project", "project", include_audio=True, asset_report=asset_report)
    emit_save_config(output, save_config)
    backgrounds_name, background_count = emit_topdown_backgrounds(output, topdown_project, asset_report)
    resource_banks_name, resource_bank_count, resource_bank_groups_name, resource_bank_group_count = emit_topdown_resource_banks(output, topdown_project, asset_report)
    emit_resource_bank_upload_sources(output, asset_report)

    room_entries = []
    for room_index, room in enumerate(rooms):
        if not isinstance(room, dict):
            raise SystemExit(f"topdown_project.rooms[{room_index}] precisa ser objeto")
        width = int(room.get("width_tiles", 0))
        height = int(room.get("height_tiles", 0))
        if not has_valid_streaming_room_dimensions(width, height):
            raise SystemExit(f"topdown_project.rooms[{room_index}] dimensoes invalidas")
        tile_count = width * height
        prefix = pack_safe_identifier(room.get("name", f"room_{room_index}"))
        visual = int_list_from_json(
            room.get("visual_tiles"),
            tile_count,
            f"topdown_project.rooms[{room_index}].visual_tiles",
            maximum=0xFFFF,
        )
        visual = remap_topdown_visual_tiles_from_asset(room, visual, room_index, asset_report, base_dir)
        foreground_name = "nullptr"
        if "foreground_tiles" in room:
            foreground = int_list_from_json(
                room.get("foreground_tiles"),
                tile_count,
                f"topdown_project.rooms[{room_index}].foreground_tiles",
                minimum=-1,
                maximum=0xFFFF,
            )
            foreground = remap_topdown_foreground_tiles_from_asset(
                room,
                foreground,
                room_index,
                asset_report,
                base_dir,
            )
            foreground_name = f"{prefix}_foreground_tiles"
        collision = int_list_from_json(room.get("collision_flags"), tile_count, f"topdown_project.rooms[{room_index}].collision_flags")
        collision_slopes = int_list_from_json(
            room.get("collision_slopes", [0] * tile_count),
            tile_count,
            f"topdown_project.rooms[{room_index}].collision_slopes",
            maximum=4,
        )
        output.append(format_cpp_u16_array(f"{prefix}_visual_tiles", visual))
        output.append("")
        if foreground_name != "nullptr":
            output.append(format_cpp_u16_array(foreground_name, foreground))
            output.append("")
        output.append(format_cpp_u8_array(f"{prefix}_collision_flags", collision))
        output.append("")
        collision_slopes_name = "nullptr"
        if any(value != 0 for value in collision_slopes):
            collision_slopes_name = f"{prefix}_collision_slopes"
            slope_names = (
                "None",
                "BlockAboveRising",
                "BlockBelowRising",
                "BlockAboveFalling",
                "BlockBelowFalling",
            )
            output.append(f"constexpr gbs::TileSlope {collision_slopes_name}[] = {{")
            for value in collision_slopes:
                output.append(f"    gbs::TileSlope::{slope_names[value]},")
            output.append("};")
            output.append("")
        on_enter_script = emit_event_script(
            output,
            f"{prefix}_on_enter",
            room.get("on_enter"),
            f"topdown_project.rooms[{room_index}].on_enter",
            animation_lookup=player_animation_lookup,
        )
        on_exit_script = emit_event_script(
            output,
            f"{prefix}_on_exit",
            room.get("on_exit"),
            f"topdown_project.rooms[{room_index}].on_exit",
            animation_lookup=player_animation_lookup,
        )
        on_interact_script = emit_event_script(
            output,
            f"{prefix}_on_interact",
            room.get("on_interact"),
            f"topdown_project.rooms[{room_index}].on_interact",
            animation_lookup=player_animation_lookup,
        )
        on_hit_group_scripts = []
        for group_index in (1, 2, 3):
            on_hit_group_scripts.append(emit_event_script(
                output,
                f"{prefix}_on_hit_group{group_index}",
                room.get(f"on_hit_group{group_index}"),
                f"topdown_project.rooms[{room_index}].on_hit_group{group_index}",
                animation_lookup=player_animation_lookup,
            ))

        portals = room.get("portals", [])
        if not isinstance(portals, list):
            raise SystemExit(f"topdown_project.rooms[{room_index}].portals precisa ser lista")
        portal_name = "nullptr"
        portal_count = 0
        portal_events_name = "nullptr"
        portal_event_count = 0
        portal_event_entries = []
        if portals:
            portal_count = len(portals)
            portal_name = f"{prefix}_portals"
            portal_lines = []
            for portal_index, portal in enumerate(portals):
                if not isinstance(portal, dict):
                    raise SystemExit(f"topdown_project.rooms[{room_index}].portals[{portal_index}] precisa ser objeto")
                area = rect_from_json(portal.get("area"), f"topdown_project.rooms[{room_index}].portals[{portal_index}].area")
                target_position = vec2_from_json(
                    portal.get("target_position", {"x": 8, "y": 8}),
                    f"topdown_project.rooms[{room_index}].portals[{portal_index}].target_position",
                )
                target_room = int(portal.get("target_room", 0))
                target_direction_value = portal.get("target_direction")
                target_direction = {
                    "down": 0,
                    "up": 1,
                    "left": 2,
                    "right": 3,
                }.get(str(target_direction_value).lower(), 0)
                has_target_direction = target_direction_value is not None
                portal_lines.append(
                    "    gbs::Portal { "
                    f"gbs::Rect {{ {area[0]}, {area[1]}, {area[2]}, {area[3]} }}, "
                    f"{target_room}, "
                    f"gbs::Vec2i {{ {target_position[0]}, {target_position[1]} }}, "
                    f"{target_direction}, "
                    f"{'true' if has_target_direction else 'false'} "
                    "},"
                )
                portal_script = emit_event_script(
                    output,
                    f"{prefix}_portal_{portal_index}",
                    portal.get("script", portal.get("event")),
                    f"topdown_project.rooms[{room_index}].portals[{portal_index}].script",
                    animation_lookup=player_animation_lookup,
                )
                if portal_script != "gbs::empty_event_script()":
                    portal_event_entries.append((portal_index, portal_script))
            output.append(f"constexpr gbs::Portal {portal_name}[] = {{")
            output.extend(portal_lines)
            output.append("};")
            output.append("")

        if portal_event_entries:
            portal_events_name = f"{prefix}_portal_events"
            portal_event_count = len(portal_event_entries)
            output.append(f"constexpr gbs::TopDownPortalEventData {portal_events_name}[] = {{")
            for portal_index, portal_script in portal_event_entries:
                output.append(f"    gbs::TopDownPortalEventData {{ {portal_index}, {portal_script} }},")
            output.append("};")
            output.append("")

        interactions = room.get("interactions", [])
        if not isinstance(interactions, list):
            raise SystemExit(f"topdown_project.rooms[{room_index}].interactions precisa ser lista")
        interactions_name = "nullptr"
        interaction_count = 0
        if interactions:
            interactions_name = f"{prefix}_interactions"
            interaction_count = len(interactions)
            interaction_lines = []
            for interaction_index, interaction in enumerate(interactions):
                if not isinstance(interaction, dict):
                    raise SystemExit(f"topdown_project.rooms[{room_index}].interactions[{interaction_index}] precisa ser objeto")
                area = rect_from_json(interaction.get("area"), f"topdown_project.rooms[{room_index}].interactions[{interaction_index}].area")
                script = emit_event_script(
                    output,
                    f"{prefix}_interaction_{interaction_index}",
                    interaction.get("script", interaction.get("event")),
                    f"topdown_project.rooms[{room_index}].interactions[{interaction_index}].script",
                    animation_lookup=player_animation_lookup,
                )
                interaction_lines.append(
                    "    gbs::TopDownInteractionData { "
                    f"gbs::Rect {{ {area[0]}, {area[1]}, {area[2]}, {area[3]} }}, "
                    f"{script} "
                    "},"
                )
            output.append(f"constexpr gbs::TopDownInteractionData {interactions_name}[] = {{")
            output.extend(interaction_lines)
            output.append("};")
            output.append("")

        npcs = room.get("npcs", [])
        if not isinstance(npcs, list):
            raise SystemExit(f"topdown_project.rooms[{room_index}].npcs precisa ser lista")
        npcs_name = "nullptr"
        npc_count = 0
        if npcs:
            npcs_name = f"{prefix}_npcs"
            npc_count = len(npcs)
            npc_lines = []
            for npc_index, npc in enumerate(npcs):
                if not isinstance(npc, dict):
                    raise SystemExit(f"topdown_project.rooms[{room_index}].npcs[{npc_index}] precisa ser objeto")
                position = vec2_from_json(
                    npc.get("position", {"x": 0, "y": 0}),
                    f"topdown_project.rooms[{room_index}].npcs[{npc_index}].position",
                )
                size = vec2_from_json(
                    npc.get("size", {"x": 16, "y": 16}),
                    f"topdown_project.rooms[{room_index}].npcs[{npc_index}].size",
                )
                collision_offset = vec2_from_json(
                    npc.get("collision_offset", {"x": 0, "y": 0}),
                    f"topdown_project.rooms[{room_index}].npcs[{npc_index}].collision_offset",
                )
                metasprite = resolve_project_metasprite_symbol(
                    npc.get("metasprite"),
                    "generated_player_metasprite",
                    asset_report,
                    f"topdown_project.rooms[{room_index}].npcs[{npc_index}].metasprite",
                )
                animation_expr, animation_table, animation_count, animation_lookup = emit_topdown_npc_animation_table(
                    output,
                    f"{prefix}_npc_{npc_index}",
                    npc,
                    asset_report,
                    f"topdown_project.rooms[{room_index}].npcs[{npc_index}]",
                    base_dir,
                )
                on_interact = emit_event_script(
                    output,
                    f"{prefix}_npc_{npc_index}_on_interact",
                    npc.get("on_interact", npc.get("script")),
                    f"topdown_project.rooms[{room_index}].npcs[{npc_index}].on_interact",
                    animation_lookup=animation_lookup,
                )
                on_start = emit_event_script(
                    output,
                    f"{prefix}_npc_{npc_index}_on_start",
                    npc.get("on_start"),
                    f"topdown_project.rooms[{room_index}].npcs[{npc_index}].on_start",
                    animation_lookup=animation_lookup,
                )
                on_update = emit_event_script(
                    output,
                    f"{prefix}_npc_{npc_index}_on_update",
                    npc.get("on_update"),
                    f"topdown_project.rooms[{room_index}].npcs[{npc_index}].on_update",
                    animation_lookup=animation_lookup,
                )
                on_hit_actor = emit_event_script(
                    output,
                    f"{prefix}_npc_{npc_index}_on_hit_actor",
                    npc.get("on_hit_actor"),
                    f"topdown_project.rooms[{room_index}].npcs[{npc_index}].on_hit_actor",
                    animation_lookup=animation_lookup,
                )
                on_hit_player = emit_event_script(
                    output,
                    f"{prefix}_npc_{npc_index}_on_hit_player",
                    npc.get("on_hit_player"),
                    f"topdown_project.rooms[{room_index}].npcs[{npc_index}].on_hit_player",
                    animation_lookup=animation_lookup,
                )
                on_hit_group1 = emit_event_script(
                    output,
                    f"{prefix}_npc_{npc_index}_on_hit_group1",
                    npc.get("on_hit_group1"),
                    f"topdown_project.rooms[{room_index}].npcs[{npc_index}].on_hit_group1",
                    animation_lookup=animation_lookup,
                )
                on_hit_group2 = emit_event_script(
                    output,
                    f"{prefix}_npc_{npc_index}_on_hit_group2",
                    npc.get("on_hit_group2"),
                    f"topdown_project.rooms[{room_index}].npcs[{npc_index}].on_hit_group2",
                    animation_lookup=animation_lookup,
                )
                on_hit_group3 = emit_event_script(
                    output,
                    f"{prefix}_npc_{npc_index}_on_hit_group3",
                    npc.get("on_hit_group3"),
                    f"topdown_project.rooms[{room_index}].npcs[{npc_index}].on_hit_group3",
                    animation_lookup=animation_lookup,
                )
                on_defeated = emit_event_script(
                    output,
                    f"{prefix}_npc_{npc_index}_on_defeated",
                    npc.get("on_defeated"),
                    f"topdown_project.rooms[{room_index}].npcs[{npc_index}].on_defeated",
                    animation_lookup=animation_lookup,
                )
                direction = topdown_actor_direction_from_json(npc.get("direction", "down"))
                movement = emit_topdown_npc_movement(npc.get("movement"), room_index, npc_index)
                affine_obj = emit_topdown_affine_obj(
                    output,
                    npc.get("affine_obj"),
                    f"topdown_project.rooms[{room_index}].npcs[{npc_index}].affine_obj",
                    f"topdown_room_{room_index}_npc_{npc_index}",
                )
                npc_name = cpp_string_literal(npc.get("name", f"{prefix}_npc_{npc_index}"))
                npc_lines.append(
                    "    gbs::TopDownNpcData {\n"
                    f"        gbs::Vec2i {{ {position[0]}, {position[1]} }},\n"
                    f"        gbs::Vec2i {{ {size[0]}, {size[1]} }},\n"
                    f"        &{metasprite},\n"
                    f"        {animation_expr},\n"
                    f"        {on_interact},\n"
                    f"        {npc_name},\n"
                    f"        gbs::TopDownActorDirection::{direction},\n"
                    f"        {int(npc.get('collision_group', 0))},\n"
                    f"        {int(npc.get('movement_speed_x100', 100))},\n"
                    f"        {int(npc.get('animation_speed_percent', 100))},\n"
                    f"        {max(1, int(npc.get('health', 1)))},\n"
                    f"        {on_start},\n"
                    f"        {on_update},\n"
                    f"        {on_hit_actor},\n"
                    f"        {on_hit_player},\n"
                    f"        {on_hit_group1},\n"
                    f"        {on_hit_group2},\n"
                    f"        {on_hit_group3},\n"
                    f"        {on_defeated},\n"
                    f"        {movement},\n"
                    f"        static_cast<uint16_t>({int(npc.get('collision_mask', 0xFFFF))}),\n"
                    f"        {animation_table},\n"
                    f"        {animation_count},\n"
                    f"        gbs::Vec2i {{ {collision_offset[0]}, {collision_offset[1]} }},\n"
                    f"        {max(0, min(255, int(npc.get('push_priority', 0))))},\n"
                    f"        {'true' if npc.get('pushable', False) else 'false'},\n"
                    f"        {affine_obj}\n"
                    "    },"
                )
            output.append(f"constexpr gbs::TopDownNpcData {npcs_name}[] = {{")
            output.extend(npc_lines)
            output.append("};")
            output.append("")

        triggers = room.get("triggers", [])
        if not isinstance(triggers, list):
            raise SystemExit(f"topdown_project.rooms[{room_index}].triggers precisa ser lista")
        triggers_name = "nullptr"
        trigger_count = 0
        if triggers:
            triggers_name = f"{prefix}_triggers"
            trigger_count = len(triggers)
            trigger_lines = []
            for trigger_index, trigger in enumerate(triggers):
                if not isinstance(trigger, dict):
                    raise SystemExit(f"topdown_project.rooms[{room_index}].triggers[{trigger_index}] precisa ser objeto")
                area = rect_from_json(trigger.get("area"), f"topdown_project.rooms[{room_index}].triggers[{trigger_index}].area")
                on_enter = emit_event_script(
                    output,
                    f"{prefix}_trigger_{trigger_index}_on_enter",
                    trigger.get("on_enter", trigger.get("script")),
                    f"topdown_project.rooms[{room_index}].triggers[{trigger_index}].on_enter",
                    animation_lookup=player_animation_lookup,
                )
                on_leave = emit_event_script(
                    output,
                    f"{prefix}_trigger_{trigger_index}_on_leave",
                    trigger.get("on_leave"),
                    f"topdown_project.rooms[{room_index}].triggers[{trigger_index}].on_leave",
                    animation_lookup=player_animation_lookup,
                )
                condition = emit_event_script(
                    output,
                    f"{prefix}_trigger_{trigger_index}_condition",
                    trigger.get("condition"),
                    f"topdown_project.rooms[{room_index}].triggers[{trigger_index}].condition",
                    animation_lookup=player_animation_lookup,
                )
                kind = topdown_trigger_kind_from_json(trigger.get("kind", "standard"))
                trigger_lines.append(
                    "    gbs::TopDownTriggerData {\n"
                    f"        gbs::Rect {{ {area[0]}, {area[1]}, {area[2]}, {area[3]} }},\n"
                    f"        {on_enter},\n"
                    f"        {on_leave},\n"
                    f"        {'true' if bool(trigger.get('run_once', False)) else 'false'},\n"
                    f"        static_cast<uint16_t>({int(trigger.get('cooldown_frames', 0))}),\n"
                    f"        {condition},\n"
                    f"        gbs::TopDownTriggerKind::{kind}\n"
                    "    },"
                )
            output.append(f"constexpr gbs::TopDownTriggerData {triggers_name}[] = {{")
            output.extend(trigger_lines)
            output.append("};")
            output.append("")

        camera_zones = room.get("camera_zones", [])
        if not isinstance(camera_zones, list):
            raise SystemExit(f"topdown_project.rooms[{room_index}].camera_zones precisa ser lista")
        camera_zones_name = "nullptr"
        camera_zone_count = 0
        if camera_zones:
            camera_zones_name = f"{prefix}_camera_zones"
            camera_zone_count = len(camera_zones)
            output.append(f"constexpr gbs::CameraZone {camera_zones_name}[] = {{")
            for zone_index, zone in enumerate(camera_zones):
                if not isinstance(zone, dict):
                    raise SystemExit(f"topdown_project.rooms[{room_index}].camera_zones[{zone_index}] precisa ser objeto")
                area = rect_from_json(zone.get("area"), f"topdown_project.rooms[{room_index}].camera_zones[{zone_index}].area")
                bounds = rect_from_json(zone.get("bounds", zone.get("bounds_pixels")), f"topdown_project.rooms[{room_index}].camera_zones[{zone_index}].bounds")
                offset = vec2_from_json(zone.get("offset", zone.get("offset_pixels", {"x": 0, "y": 0})), f"topdown_project.rooms[{room_index}].camera_zones[{zone_index}].offset")
                output.append(
                    "    gbs::CameraZone { "
                    f"gbs::Rect {{ {area[0]}, {area[1]}, {area[2]}, {area[3]} }}, "
                    f"gbs::Rect {{ {bounds[0]}, {bounds[1]}, {bounds[2]}, {bounds[3]} }}, "
                    f"gbs::Vec2i {{ {offset[0]}, {offset[1]} }}, "
                    f"{'true' if bool(zone.get('lock_x', False)) else 'false'}, "
                    f"{'true' if bool(zone.get('lock_y', False)) else 'false'} "
                    "},"
                )
            output.append("};")
            output.append("")

        room_metadata = emit_topdown_room_metadata(room, room_index)
        background_bits_per_pixel = int(room.get("background_bits_per_pixel", 4))
        if background_bits_per_pixel != 4:
            raise SystemExit(
                f"topdown_project.rooms[{room_index}].background_bits_per_pixel suporta somente 4"
            )
        room_name_literal = cpp_string_literal(room.get("name", f"room_{room_index}"))
        room_bank_group = room.get("resource_bank_group", room.get("bank_group", None))
        if room_bank_group is not None and not isinstance(room_bank_group, str):
            raise SystemExit(f"topdown_project.rooms[{room_index}].resource_bank_group precisa ser string")
        room_bank_group_literal = cpp_string_literal(room_bank_group) if room_bank_group else "nullptr"
        visual_tilemap = room.get("visual_tilemap", room.get("visual_tilemap_asset"))
        uses_visual_tilemap = visual_tilemap is not None
        visual_tilemap_literal = "nullptr"
        visual_tiles_literal = "nullptr"
        visual_palette_literal = "nullptr"
        if uses_visual_tilemap:
            visual_tilemap_symbol = resolve_project_asset_symbol(
                visual_tilemap,
                "tilemap",
                asset_report,
                f"topdown_project.rooms[{room_index}].visual_tilemap",
            )
            visual_tilemap_literal = f"&{visual_tilemap_symbol}"
            visual_tiles_symbol = resolve_project_asset_symbol(
                visual_tilemap,
                "tile_asset",
                asset_report,
                f"topdown_project.rooms[{room_index}].visual_tilemap",
            )
            visual_tiles_literal = f"&{visual_tiles_symbol}"
            visual_palette_symbol = resolve_project_asset_symbol(
                visual_tilemap,
                "palette_asset",
                asset_report,
                f"topdown_project.rooms[{room_index}].visual_tilemap",
            )
            visual_palette_literal = f"&{visual_palette_symbol}"
        room_video_literal = room_video_composition_literal(
            room,
            f"topdown_project.rooms[{room_index}]",
            asset_report,
        )
        room_entries.append(
            "    gbs::TopDownRoomData {\n"
            f"        {prefix}_visual_tiles,\n"
            f"        {prefix}_collision_flags,\n"
            f"        {width},\n"
            f"        {height},\n"
            f"        {portal_name},\n"
            f"        {portal_count},\n"
            f"        {on_enter_script},\n"
            f"        {on_exit_script},\n"
            f"        {portal_events_name},\n"
            f"        {portal_event_count},\n"
            f"        {on_interact_script},\n"
            f"        {interactions_name},\n"
            f"        {interaction_count},\n"
            f"        {npcs_name},\n"
            f"        {npc_count},\n"
            f"        {room_metadata},\n"
            f"        {triggers_name},\n"
            f"        {trigger_count},\n"
            "        nullptr,\n"
            "        0,\n"
            f"        {room_name_literal},\n"
            f"        {collision_slopes_name},\n"
            f"        {room_bank_group_literal},\n"
            f"        {camera_zones_name},\n"
            f"        {camera_zone_count},\n"
            f"        {foreground_name},\n"
            f"        {'true' if uses_visual_tilemap else 'false'},\n"
            f"        {visual_tilemap_literal},\n"
            f"        {visual_tiles_literal},\n"
            f"        {visual_palette_literal},\n"
            f"        {room_video_literal},\n"
            f"        {on_hit_group_scripts[0]},\n"
            f"        {on_hit_group_scripts[1]},\n"
            f"        {on_hit_group_scripts[2]}\n"
            "    }"
        )

    output.append("constexpr gbs::TopDownRoomData rooms[] = {")
    output.append(",\n".join(room_entries))
    output.append("};")
    output.append("")

    dialogue_lines_name, dialogue_line_count = emit_dialogue_lines(
        output,
        dialogue_lines,
        "topdown_project.dialogue_lines",
    )
    portrait_assets = dialogue_portrait_assets_from_json(
        topdown_project.get("portrait_assets"),
        "topdown_project.portrait_assets",
        asset_report,
    )
    emit_dialogue_portrait_assets(output, portrait_assets)
    emit_dialogue_box_skin(output, dialogue_box_skin)
    emit_dialogue_box_skin(output, hud_box_skin, "hud_box_skin")
    emit_hud_box_config(output, hud_box_config)
    emit_dialogue_font(output, dialogue_font)
    emit_dialogue_choice_selector(output, dialogue_choice_selector)
    emote_assets = dialogue_emote_assets_from_json(
        topdown_project.get("emote_assets"),
        "topdown_project.emote_assets",
        asset_report,
    )
    emit_dialogue_emote_assets(output, emote_assets)

    quests = topdown_project.get("quests", [])
    if quests is None:
        quests = []
    if not isinstance(quests, list):
        raise SystemExit("topdown_project.quests precisa ser lista")
    quest_entries = []
    for quest_index, quest in enumerate(quests):
        if not isinstance(quest, dict):
            raise SystemExit(f"topdown_project.quests[{quest_index}] precisa ser objeto")
        quest_entries.append(
            "    gbs::TopDownQuestData { "
            f"{cpp_string_literal(quest.get('id', f'quest_{quest_index}'))}, "
            f"{int(quest.get('state_variable', 0))}, "
            f"{int(quest.get('active_value', 1))}, "
            f"{int(quest.get('completed_value', 2))}, "
            f"{int(quest.get('objective_item', 0))}, "
            f"{max(1, int(quest.get('objective_quantity', 1)))}, "
            f"{int(quest.get('reward_item', 1))}, "
            f"{max(1, int(quest.get('reward_quantity', 1)))}, "
            "gbs::empty_event_script() },"
        )
    quests_name = "nullptr"
    if quest_entries:
        quests_name = "topdown_quests"
        output.append(f"constexpr gbs::TopDownQuestData {quests_name}[] = {{")
        output.extend(quest_entries)
        output.append("};")
        output.append("")

    shop_items = topdown_project.get("shop_items", [])
    if shop_items is None:
        shop_items = []
    if not isinstance(shop_items, list):
        raise SystemExit("topdown_project.shop_items precisa ser lista")
    shop_entries = []
    for shop_index, item in enumerate(shop_items):
        if not isinstance(item, dict):
            raise SystemExit(f"topdown_project.shop_items[{shop_index}] precisa ser objeto")
        shop_entries.append(
            "    gbs::TopDownShopItemData { "
            f"{cpp_string_literal(item.get('label', f'item_{shop_index}'))}, "
            f"{int(item.get('item', 1))}, "
            f"{int(item.get('currency_item', 0))}, "
            f"{max(1, int(item.get('price', 1)))}, "
            f"{int(item.get('stock_variable', -1))}, "
            f"{max(0, int(item.get('stock', 0)))}, "
            "gbs::empty_event_script() },"
        )
    shop_items_name = "nullptr"
    if shop_entries:
        shop_items_name = "topdown_shop_items"
        output.append(f"constexpr gbs::TopDownShopItemData {shop_items_name}[] = {{")
        output.extend(shop_entries)
        output.append("};")
        output.append("")

    project_scripts_name, project_script_count, dialogue_choices_name, dialogue_choice_count = emit_topdown_choice_groups(output, topdown_project)

    output.extend([
        "const gbs::TopDownProjectData project {",
        f"    {asset_refs['bg_palettes'][0]},",
        f"    {asset_refs['bg_palettes'][1]},",
        f"    {asset_refs['obj_palettes'][0]},",
        f"    {asset_refs['obj_palettes'][1]},",
        f"    {asset_refs['tile_assets'][0]},",
        f"    {asset_refs['tile_assets'][1]},",
        f"    {backgrounds_name},",
        f"    {background_count},",
        "    rooms,",
        f"    {len(rooms)},",
        f"    {dialogue_lines_name},",
        f"    {dialogue_line_count},",
        f"    {asset_refs['sfx_assets'][0]},",
        f"    {asset_refs['sfx_assets'][1]},",
        f"    {asset_refs['music_assets'][0]},",
        f"    {asset_refs['music_assets'][1]},",
        "    gbs::TopDownActorData {",
        f"        gbs::Vec2i {{ {player_position[0]}, {player_position[1]} }},",
        f"        gbs::Vec2i {{ {player_size[0]}, {player_size[1]} }},",
        f"        {player_speed},",
        f"        &{player_metasprite},",
        f"        {player_animation_expr},",
        '        "player",',
        f"        gbs::TopDownActorDirection::{player_direction},",
        f"        {max(0, min(15, int(player.get('collision_group', 0))))},",
        "        100,",
        "        100,",
        f"        {player_on_start},",
        f"        {player_on_update},",
        "        gbs::empty_event_script(),",
        "        gbs::empty_event_script(),",
        "        gbs::empty_event_script(),",
        "        gbs::empty_event_script(),",
        "        gbs::empty_event_script(),",
        "        gbs::empty_event_script(),",
        f"        static_cast<uint16_t>({max(0, min(0xFFFF, int(player.get('collision_mask', 0xFFFF))))}),",
        f"        {player_animation_table},",
        f"        {player_animation_count},",
        f"        gbs::Vec2i {{ {player_collision_offset[0]}, {player_collision_offset[1]} }},",
        f"        {max(0, min(255, int(player.get('push_priority', 0))))},",
        f"        {'true' if player.get('pushable', False) else 'false'},",
        f"        {player_affine_obj}",
        "    },",
        f"    gbs::Camera {{ gbs::Vec2i {{ {camera_position[0]}, {camera_position[1]} }}, {'true' if camera_follow else 'false'}, false, gbs::Rect {{ 0, 0, 0, 0 }}, {camera_zoom_x256} }},",
        f"    static_cast<uint16_t>({backdrop_color}),",
        f"    {project_scripts_name},",
        f"    {project_script_count},",
        f"    {dialogue_choices_name},",
        f"    {dialogue_choice_count},",
        "    nullptr,",
        "    0,",
        f"    {asset_refs['pcm_assets'][0]},",
        f"    {asset_refs['pcm_assets'][1]},",
        f"    {asset_refs['tracker_assets'][0]},",
        f"    {asset_refs['tracker_assets'][1]},",
        f"    {resource_banks_name},",
        f"    {resource_bank_count},",
        f"    {resource_bank_groups_name},",
        f"    {resource_bank_group_count},",
        f"    {dialogue_ui_literal},",
        f"    {initial_room},",
        f"    {video_literal},",
        f"    {'true' if bool(topdown_project.get('inventory_enabled', True)) else 'false'},",
        f"    {'true' if bool(topdown_project.get('quests_enabled', True)) else 'false'},",
        f"    {'true' if bool(topdown_project.get('shop_enabled', True)) else 'false'},",
        f"    {quests_name},",
        f"    {len(quest_entries)},",
        f"    {shop_items_name},",
        f"    {len(shop_entries)},",
        f"    {actor_sprites_name},",
        f"    {len(actor_sprite_entries)}",
        "};",
        "",
        "} // namespace gbastudio_project",
        "",
    ])
    return "\n".join(output)


def platformer_config_from_json(config, description):
    if config is None:
        config = {}
    if not isinstance(config, dict):
        raise SystemExit(f"{description} precisa ser objeto")
    def collision_group(name, default=0):
        try:
            value = int(config.get(name, default))
        except (TypeError, ValueError):
            return default
        return value if value in (0, 2, 4, 8) else default

    return {
        "max_run_speed_x256": int(config.get("max_run_speed_x256", 0x0180)),
        "acceleration_x256": int(config.get("acceleration_x256", 0x0040)),
        "friction_x256": int(config.get("friction_x256", 0x0030)),
        "gravity_x256": int(config.get("gravity_x256", 0x0030)),
        "max_fall_speed_x256": int(config.get("max_fall_speed_x256", 0x0400)),
        "jump_speed_x256": int(config.get("jump_speed_x256", 0x0580)),
        "coyote_frames": int(config.get("coyote_frames", 4)),
        "jump_buffer_frames": int(config.get("jump_buffer_frames", 5)),
        "ladders_enabled": bool(config.get("ladders_enabled", True)),
        "max_air_jumps": max(0, min(255, int(config.get("max_air_jumps", 0)))),
        "wall_jump_enabled": bool(config.get("wall_jump_enabled", False)),
        "wall_slide_enabled": bool(config.get("wall_slide_enabled", True)),
        "jump_min_height_x256": max(0, int(config.get("jump_min_height_x256", 0))),
        "jump_hold_frames": max(0, min(255, int(config.get("jump_hold_frames", 1)))),
        "jump_height_reduction_x256": max(0, int(config.get("jump_height_reduction_x256", 0))),
        "air_control_enabled": bool(config.get("air_control_enabled", True)),
        "turn_in_air_enabled": bool(config.get("turn_in_air_enabled", True)),
        "air_deceleration_x256": max(0, int(config.get("air_deceleration_x256", 0))),
        "drop_through_mode": max(0, min(4, int(config.get("drop_through_mode", 0)))),
        "camera_follow_directions": max(0, min(15, int(config.get("camera_follow_directions", 15)))),
        "camera_deadzone_x_pixels": max(0, min(240, int(config.get("camera_deadzone_x_pixels", 0)))),
        "camera_lock_edge": max(0, min(3, int(config.get("camera_lock_edge", 0)))),
        "wall_slide_speed_x256": int(config.get("wall_slide_speed_x256", 0x0180)),
        "wall_jump_speed_x256": int(config.get("wall_jump_speed_x256", 0x0500)),
        "wall_jump_push_x256": int(config.get("wall_jump_push_x256", 0x0300)),
        "dash_enabled": bool(config.get("dash_enabled", False)),
        "dash_style": max(0, min(2, int(config.get("dash_style", 2)))),
        "dash_momentum": max(0, min(2, int(config.get("dash_momentum", 0)))),
        "dash_through": max(0, min(3, int(config.get("dash_through", 0)))),
        "dash_recharge_frames": max(0, min(255, int(config.get("dash_recharge_frames", 0)))),
        "dash_speed_x256": int(config.get("dash_speed_x256", 0x0600)),
        "dash_frames": max(0, min(255, int(config.get("dash_frames", 8)))),
        "glide_enabled": bool(config.get("glide_enabled", False)),
        "glide_fall_speed_x256": int(config.get("glide_fall_speed_x256", 0x0140)),
        "platform_actor_collision_group": collision_group("platform_actor_collision_group"),
        "solid_actor_collision_group": collision_group("solid_actor_collision_group"),
        "actor_gravity_enabled": bool(config.get("actor_gravity_enabled", False)),
    }


def emit_platformer_config(config):
    return (
        "gbs::PlatformerConfig {\n"
        f"            {config['max_run_speed_x256']},\n"
        f"            {config['acceleration_x256']},\n"
        f"            {config['friction_x256']},\n"
        f"            {config['gravity_x256']},\n"
        f"            {config['max_fall_speed_x256']},\n"
        f"            {config['jump_speed_x256']},\n"
        f"            {config['coyote_frames']},\n"
        f"            {config['jump_buffer_frames']},\n"
        f"            {'true' if config['ladders_enabled'] else 'false'},\n"
        f"            {config['max_air_jumps']},\n"
        f"            {'true' if config['wall_jump_enabled'] else 'false'},\n"
        f"            {config['wall_slide_speed_x256']},\n"
        f"            {config['wall_jump_speed_x256']},\n"
        f"            {config['wall_jump_push_x256']},\n"
        f"            {'true' if config['dash_enabled'] else 'false'},\n"
        f"            {config['dash_speed_x256']},\n"
        f"            {config['dash_frames']},\n"
        f"            {'true' if config['glide_enabled'] else 'false'},\n"
        f"            {config['glide_fall_speed_x256']},\n"
        f"            {'true' if config['wall_slide_enabled'] else 'false'},\n"
        f"            {config['jump_min_height_x256']},\n"
        f"            {config['jump_hold_frames']},\n"
        f"            {config['jump_height_reduction_x256']},\n"
        f"            {'true' if config['air_control_enabled'] else 'false'},\n"
        f"            {'true' if config['turn_in_air_enabled'] else 'false'},\n"
        f"            {config['air_deceleration_x256']},\n"
        f"            {config['drop_through_mode']},\n"
        f"            {config['camera_follow_directions']},\n"
        f"            {config['camera_deadzone_x_pixels']},\n"
        f"            {config['camera_lock_edge']},\n"
        f"            {config['dash_style']},\n"
        f"            {config['dash_momentum']},\n"
        f"            {config['dash_through']},\n"
        f"            {config['dash_recharge_frames']},\n"
        f"            {config['platform_actor_collision_group']},\n"
        f"            {config['solid_actor_collision_group']},\n"
        f"            {'true' if config['actor_gravity_enabled'] else 'false'}\n"
        "        }"
    )


def save_signature_from_json(value, description, default):
    if value is None:
        return default
    if not isinstance(value, str):
        raise SystemExit(f"{description} precisa ser string")
    if len(value) != 4:
        raise SystemExit(f"{description} precisa ter exatamente 4 caracteres")
    return value


def save_config_from_json(config, description, default_signature, default_offset, default_slot_capacity=1024, default_slot_count=1):
    if config is None:
        config = {}
    if not isinstance(config, dict):
        raise SystemExit(f"{description} precisa ser objeto")
    enabled = bool(config.get("enabled", config.get("autosave", False)))
    save_type = config.get("save_type", "sram")
    if save_type not in ("sram", "flash1m"):
        raise SystemExit(f"{description}.save_type precisa ser sram ou flash1m")
    signature = save_signature_from_json(config.get("signature"), f"{description}.signature", default_signature)
    slot_capacity = int(config.get("slot_capacity", config.get("slot_capacity_bytes", default_slot_capacity)))
    slot_count = int(config.get("slot_count", default_slot_count))
    offset = int(config.get("offset", config.get("sram_offset", default_offset)))
    version = int(config.get("version", 1))
    if slot_capacity <= 0 or slot_count < 0 or offset < 0 or version < 0 or version > 65535:
        raise SystemExit(f"{description} possui valores invalidos")
    if slot_count > 255:
        raise SystemExit(f"{description}.slot_count nao pode exceder 255")
    if save_type == "flash1m" and enabled and (
        offset % 4096 != 0 or slot_capacity % 4096 != 0 or
        offset + slot_capacity * slot_count > 32768
    ):
        raise SystemExit(f"{description} precisa usar setores Flash1M de 4096 bytes nos primeiros 32768 bytes")
    ui = config.get("ui", {})
    if not isinstance(ui, dict):
        raise SystemExit(f"{description}.ui precisa ser objeto")
    actions = ui.get("actions", {})
    metadata = ui.get("metadata", {})
    if not isinstance(actions, dict) or not isinstance(metadata, dict):
        raise SystemExit(f"{description}.ui.actions e metadata precisam ser objetos")
    selected_slot = int(ui.get("selectedSlot", 1))
    if slot_count > 0:
        selected_slot = max(1, min(slot_count, selected_slot))
    else:
        selected_slot = 1
    layout = str(ui.get("layout", "cards")).strip().lower()
    if layout not in ("cards", "list"):
        raise SystemExit(f"{description}.ui.layout precisa ser cards ou list")
    return {
        "enabled": enabled,
        "save_type": save_type,
        "autosave": bool(config.get("autosave", False)),
        "signature": signature,
        "slot_capacity": slot_capacity,
        "slot_count": slot_count,
        "offset": offset,
        "version": version,
        "runtime_capabilities": config.get("runtime_capabilities"),
        "ui": {
            "continue_label": str(actions.get("continue", ui.get("continueLabel", "Continuar"))),
            "load_label": str(actions.get("load", ui.get("loadLabel", "Carregar"))),
            "delete_label": str(actions.get("delete", ui.get("deleteLabel", "Apagar"))),
            "layout": layout,
            "selected_slot": selected_slot,
            "confirm_delete": bool(ui.get("confirmDelete", True)),
            "show_player_name": bool(metadata.get("playerName", ui.get("showPlayerName", True))),
            "show_play_time": bool(metadata.get("playTime", ui.get("showPlayTime", True))),
            "show_location": bool(metadata.get("location", ui.get("showLocation", True))),
            "enabled": bool(ui.get("enabled", True)),
            "profile_id": str(ui.get("profileId", "default")),
            "custom_labels": bool(ui.get("customLabels", False)),
        },
    }


RUNTIME_CAPABILITY_ENUMS = {
    "save": "Save",
    "rtc": "Rtc",
    "link": "Link",
    "affine": "Affine",
}


def runtime_capability_entries_from_json(value, fallback_save_enabled, description="runtime_capabilities"):
    defaults = {
        capability_id: {
            "enabled": capability_id == "save" and fallback_save_enabled,
            "required": capability_id == "save" and fallback_save_enabled,
        }
        for capability_id in RUNTIME_CAPABILITY_ENUMS
    }
    if value is None:
        return defaults
    if not isinstance(value, dict):
        raise SystemExit(f"{description} precisa ser objeto")
    if int(value.get("schema", 1)) != 1:
        raise SystemExit(f"{description}.schema precisa ser 1")
    if value.get("registry") != "gba-studio-runtime-capabilities":
        raise SystemExit(f"{description}.registry invalido")
    capabilities = value.get("capabilities")
    if not isinstance(capabilities, list):
        raise SystemExit(f"{description}.capabilities precisa ser lista")
    entries = {}
    for index, capability in enumerate(capabilities):
        if not isinstance(capability, dict):
            raise SystemExit(f"{description}.capabilities[{index}] precisa ser objeto")
        capability_id = capability.get("id")
        if capability_id not in RUNTIME_CAPABILITY_ENUMS:
            raise SystemExit(f"{description}.capabilities[{index}].id invalido")
        if capability_id in entries:
            raise SystemExit(f"{description}.capabilities possui id duplicado: {capability_id}")
        enabled = capability.get("enabled")
        required = capability.get("required", enabled)
        if not isinstance(enabled, bool) or not isinstance(required, bool):
            raise SystemExit(f"{description}.capabilities[{index}] possui enabled/required invalidos")
        entries[capability_id] = {"enabled": enabled, "required": required}
    if set(entries) != set(RUNTIME_CAPABILITY_ENUMS):
        raise SystemExit(f"{description}.capabilities precisa declarar save, rtc, link e affine")
    return entries


def emit_runtime_capabilities(output, manifest, fallback_save_enabled):
    entries = runtime_capability_entries_from_json(manifest, fallback_save_enabled)
    output.extend([
        "constexpr gbs::RuntimeCapabilityDescriptor runtime_capability_entries[] = {",
    ])
    for capability_id, enum_name in RUNTIME_CAPABILITY_ENUMS.items():
        capability = entries[capability_id]
        output.append(
            f"    {{ gbs::RuntimeCapabilityID::{enum_name}, "
            f"{'true' if capability['enabled'] else 'false'}, "
            f"{'true' if capability['required'] else 'false'} }},"
        )
    output.extend([
        "};",
        "constexpr gbs::RuntimeCapabilityManifest runtime_capability_manifest {",
        "    1,",
        "    runtime_capability_entries,",
        "    sizeof(runtime_capability_entries) / sizeof(runtime_capability_entries[0])",
        "};",
        "",
    ])


def dialogue_ui_from_json(config, description):
    if config is None:
        config = {}
    if not isinstance(config, dict):
        raise SystemExit(f"{description} precisa ser objeto")
    frame_index = int(config.get("frame_index", 0))
    wrap_columns = int(config.get("wrap_columns", 28))
    wrap_lines = int(config.get("wrap_lines", config.get("wrap_rows", 3)))
    box_width = int(config.get("box_width", 28))
    box_height = int(config.get("box_height", 5))
    if frame_index < 0:
        raise SystemExit(f"{description}.frame_index invalido")
    if wrap_columns < 8 or wrap_columns > 40:
        raise SystemExit(f"{description}.wrap_columns invalido")
    if wrap_lines < 1 or wrap_lines > 6:
        raise SystemExit(f"{description}.wrap_lines invalido")
    if box_width < 3 or box_width > 29:
        raise SystemExit(f"{description}.box_width invalido")
    if box_height < 3 or box_height > 16:
        raise SystemExit(f"{description}.box_height invalido")
    show_portrait = bool(config.get("show_portrait", True))
    show_character_name = bool(config.get("show_character_name", True))
    portrait_position = str(config.get("portrait_position", "")).strip().lower()
    portrait_on_right = portrait_position in ("direita", "right")
    portrait_layout = str(config.get("portrait_layout", "inline")).strip().lower()
    if portrait_layout not in ("inline", "fixed_slots"):
        raise SystemExit(f"{description}.portrait_layout precisa ser inline ou fixed_slots")
    name_label_mode = str(config.get("name_label_mode", "inline")).strip().lower()
    if name_label_mode not in ("inline", "above"):
        raise SystemExit(f"{description}.name_label_mode precisa ser inline ou above")
    return {
        "frame_index": frame_index,
        "wrap_columns": wrap_columns,
        "wrap_lines": wrap_lines,
        "box_width": box_width,
        "box_height": box_height,
        "show_portrait": show_portrait,
        "show_character_name": show_character_name,
        "portrait_on_right": portrait_on_right,
        "fixed_portrait_slots": portrait_layout == "fixed_slots",
        "name_label_above": name_label_mode == "above",
    }


def emit_dialogue_ui_literal(config):
    fields = [
        str(config["frame_index"]),
        str(config["wrap_columns"]),
        str(config["wrap_lines"]),
        "true" if config["show_portrait"] else "false",
        "true" if config["show_character_name"] else "false",
        "true" if config["portrait_on_right"] else "false",
        "true" if config["fixed_portrait_slots"] else "false",
    ]
    fields.append("true" if config.get("name_label_above", False) else "false")
    fields.extend([str(config["box_width"]), str(config["box_height"])])
    return (
        "gbs::DialogueUiConfig { "
        + ", ".join(fields)
        + " "
        "}"
    )


def hud_box_config_from_json(config):
    if not isinstance(config, dict):
        config = {}
    try:
        width_px = int(config.get("hud_width", 256))
    except (TypeError, ValueError):
        width_px = 256
    try:
        height_px = int(config.get("hud_height", 24))
    except (TypeError, ValueError):
        height_px = 24
    width = max(3, min(32, width_px // 8))
    height = max(3, min(20, height_px // 8))
    x = max(0, (32 - width) // 2)
    position = str(config.get("hud_position", "Superior")).strip().lower()
    y = max(0, 20 - height) if position in ("inferior", "bottom") else 0
    return {"x": x, "y": y, "width": width, "height": height}


def emit_hud_box_config(output, config):
    output.append(
        "constexpr gbs::HudBoxConfig hud_box_config = "
        f"{{ {config['x']}, {config['y']}, {config['width']}, {config['height']} }};"
    )
    output.append("")


_font_contract_path = Path(__file__).resolve().parent.parent / "include/gbs/dialogue_font.json"
if not _font_contract_path.exists():
    _font_contract_path = Path(__file__).resolve().parents[2] / "engine/include/gbs/dialogue_font.json"
DIALOGUE_FONT_CONTRACT = json.loads(_font_contract_path.read_text(encoding="utf-8"))
DIALOGUE_FONT_CODEPOINTS = [ord(glyph["character"]) for glyph in DIALOGUE_FONT_CONTRACT["glyphs"]]


def dialogue_font_from_json(font_image_value, base_dir, description):
    if not font_image_value:
        return None
    if base_dir is None:
        raise SystemExit(f"{description}: exportacao sem base_dir nao pode resolver PNG da fonte")
    image_path = resolve_project_path(base_dir, font_image_value, description)
    width, height, _colors, indices = read_png(image_path, max_colors=2)
    if width != 128 or height != 112:
        raise SystemExit(
            f"{description}: PNG precisa ter 128x112 pixels (U+0020..U+00FF em grade 16x14 de tiles 8x8), "
            f"recebido {width}x{height}"
        )
    background_index = indices[0]
    # Palette index 1 is the dialogue skin fill. Custom glyph foregrounds
    # must use the shared text index so the font remains readable on the skin.
    binary_indices = [0 if value == background_index else 4 for value in indices]
    tiles = []
    for codepoint in DIALOGUE_FONT_CODEPOINTS:
        atlas_index = codepoint - 0x20
        tile_x = (atlas_index % 16) * 8
        tile_y = (atlas_index // 16) * 8
        tiles.append(pack_tile(width, binary_indices, tile_x, tile_y))
    return {"tiles": tiles}


def emit_dialogue_font(output, font, symbol_prefix="dialogue_font"):
    tiles_symbol = f"{symbol_prefix}_tiles"
    value_symbol = f"{symbol_prefix}_value"
    if font is None:
        output.extend([
            f"constexpr const gbs::DialogueFont* {symbol_prefix} = nullptr;",
            "",
        ])
        return
    output.append(f"constexpr uint8_t {tiles_symbol}[{len(font['tiles'])}][32] = {{")
    for tile in font["tiles"]:
        output.append("    { " + ", ".join(str(byte) for byte in tile) + " },")
    output.append("};")
    output.append(
        f"constexpr gbs::DialogueFont {value_symbol} = "
        f"{{ &{tiles_symbol}[0][0] }};"
    )
    output.append(f"constexpr const gbs::DialogueFont* {symbol_prefix} = &{value_symbol};")
    output.append("")


def dialogue_choice_selector_from_json(selector_value, base_dir, description, box_skin):
    if not selector_value:
        return None
    if box_skin is None:
        raise SystemExit(f"{description}: seletor custom exige dialogue_ui.box_skin para compartilhar a paleta")
    if base_dir is None:
        raise SystemExit(f"{description}: exportacao sem base_dir nao pode resolver PNG do seletor")
    image_path = resolve_project_path(base_dir, selector_value, description)
    width, height, colors, indices = read_png(image_path, max_colors=16)
    if width != 8 or height != 8:
        raise SystemExit(f"{description}: PNG precisa ter 8x8 pixels, recebido {width}x{height}")

    palette = box_skin["palette"]
    remap = []
    for color in colors:
        best_index = min(
            range(16),
            key=lambda index: sum((color[channel] - palette[index][channel]) ** 2 for channel in range(3)),
        )
        remap.append(best_index)
    remapped_indices = [remap[index] for index in indices]
    return {"tile": pack_tile(8, remapped_indices, 0, 0)}


def emit_dialogue_choice_selector(output, selector):
    if selector is None:
        output.extend([
            "constexpr const gbs::DialogueChoiceSelector* dialogue_choice_selector = nullptr;",
            "",
        ])
        return
    output.append("constexpr uint8_t dialogue_choice_selector_tile[32] = {")
    output.append("    " + ", ".join(str(byte) for byte in selector["tile"]))
    output.append("};")
    output.append(
        "constexpr gbs::DialogueChoiceSelector dialogue_choice_selector_value = "
        "{ dialogue_choice_selector_tile };"
    )
    output.append(
        "constexpr const gbs::DialogueChoiceSelector* dialogue_choice_selector = "
        "&dialogue_choice_selector_value;"
    )
    output.append("")


def dialogue_box_skin_from_json(box_skin_value, base_dir, description):
    if not box_skin_value:
        return None
    if base_dir is None:
        raise SystemExit(f"{description}: exportacao sem base_dir nao pode resolver PNG da skin")
    image_path = resolve_project_path(base_dir, box_skin_value, description)
    width, height, colors, indices = read_png(image_path, max_colors=16)
    if width != 24 or height != 24:
        raise SystemExit(
            f"{description}: PNG precisa ter 24x24 pixels (grade 3x3 de tiles 8x8 - "
            f"cantos, bordas e preenchimento), recebido {width}x{height}"
        )
    if len(colors) > 14:
        raise SystemExit(
            f"{description}: PNG pode usar no maximo 14 cores visiveis; "
            "os indices 0 e 4 sao reservados para transparencia e texto"
        )

    center_indices = [
        indices[y * width + x]
        for y in range(8, 16)
        for x in range(8, 16)
    ]
    fill_source_index = Counter(center_indices).most_common(1)[0][0]
    fill_color = colors[fill_source_index]
    text_source_index = max(
        range(len(colors)),
        key=lambda index: (
            2 * ((colors[index][0] - fill_color[0]) ** 2)
            + 4 * ((colors[index][1] - fill_color[1]) ** 2)
            + ((colors[index][2] - fill_color[2]) ** 2),
            index,
        ),
    )

    palette = [(0, 0, 0)] * 16
    palette[1] = fill_color
    palette[4] = colors[text_source_index]
    available_indices = iter([2, 3, *range(5, 16)])
    source_to_runtime = {fill_source_index: 1}
    for source_index, color in enumerate(colors):
        if source_index == fill_source_index:
            continue
        runtime_index = next(available_indices)
        source_to_runtime[source_index] = runtime_index
        palette[runtime_index] = color
    indices = [source_to_runtime[index] for index in indices]

    tiles = []
    for tile_y in range(0, 24, 8):
        for tile_x in range(0, 24, 8):
            tiles.append(pack_tile(24, indices, tile_x, tile_y))
    return {"tiles": tiles, "palette": palette}


def emit_dialogue_box_skin(output, skin, symbol_prefix="dialogue_box_skin"):
    if skin is None:
        output.extend([
            f"constexpr const gbs::DialogueBoxSkin* {symbol_prefix} = nullptr;",
            "",
        ])
        return
    output.append(f"constexpr uint8_t {symbol_prefix}_tiles[9][32] = {{")
    for tile in skin["tiles"]:
        output.append("    { " + ", ".join(str(byte) for byte in tile) + " },")
    output.append("};")
    output.append(f"constexpr uint16_t {symbol_prefix}_palette[16] = {{")
    output.append("    " + ", ".join(str(rgb15(color)) for color in skin["palette"]))
    output.append("};")
    output.append(
        f"constexpr gbs::DialogueBoxSkin {symbol_prefix}_value = "
        f"{{ &{symbol_prefix}_tiles[0][0], {symbol_prefix}_palette }};"
    )
    output.append(f"constexpr const gbs::DialogueBoxSkin* {symbol_prefix} = &{symbol_prefix}_value;")
    output.append("")


SHARED_DIALOGUE_UI_PROJECT_KEYS = (
    "topdown_project",
    "platformer_project",
    "isometric_project",
    "menu_project",
    "shmup_project",
    "point_click_project",
    "dungeon_crawler_project",
    "racing_project",
    "cutscene_project",
    "visual_novel_project",
    "world_map_project",
    "battle_rpg_project",
    "luta_project",
)


def hud_behavior_from_json(value, description):
    if not isinstance(value, dict):
        raise SystemExit(f"{description} precisa ser objeto")
    def integer(value, label, minimum=-2147483648, maximum=2147483647):
        if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
            raise SystemExit(f"{label} fora do limite")
        return value
    states = value.get("states", {})
    if not isinstance(states, dict):
        raise SystemExit(f"{description}.states precisa ser objeto")
    normalized_states = {}
    for name, condition in states.items():
        if name not in ("selected", "disabled", "hidden") or not isinstance(condition, dict):
            raise SystemExit(f"{description}.states invalido")
        normalized = {"variable": integer(condition.get("variable"), description + ".variable", 0, 63), "value": integer(condition.get("value"), description + ".value")}
        if "text" in condition:
            if not isinstance(condition["text"], str): raise SystemExit(f"{description}.text precisa ser string")
            normalized["text"] = condition["text"]
        normalized_states[name] = normalized
    events = value.get("events", [])
    if not isinstance(events, list) or len(events) > 8:
        raise SystemExit(f"{description}.events excede 8 gatilhos")
    normalized_events = []
    for event in events:
        if not isinstance(event, dict) or event.get("trigger") not in ("appear", "valueChanged", "focus", "confirm"):
            raise SystemExit(f"{description}.trigger invalido")
        actions = event.get("actions", [])
        if not isinstance(actions, list) or not 1 <= len(actions) <= 16:
            raise SystemExit(f"{description}.actions precisa ter 1 a 16 ações")
        normalized_actions = []
        for action in actions:
            if not isinstance(action, dict) or action.get("op") not in ("set_variable", "add_variable"):
                raise SystemExit(f"{description}.action invalida")
            normalized_actions.append({"op":action["op"],"variable":integer(action.get("variable"),description+".variable",0,63),"value":integer(action.get("value"),description+".value")})
        normalized_event = {"trigger":event["trigger"],"actions":normalized_actions}
        if event["trigger"] == "valueChanged" or "watch_variable" in event:
            normalized_event["watch_variable"] = integer(event.get("watch_variable"),description+".watch_variable",0,63)
        normalized_events.append(normalized_event)
    return {"states":normalized_states,"events":normalized_events}


def hud_layouts_from_json(value, description):
    if value is None:
        return []
    if not isinstance(value, list):
        raise SystemExit(f"{description} precisa ser lista")
    layouts = []
    for layout_index, layout in enumerate(value):
        layout_description = f"{description}[{layout_index}]"
        if not isinstance(layout, dict):
            raise SystemExit(f"{layout_description} precisa ser objeto")
        layout_id = layout.get("id")
        mode = layout.get("mode")
        components = layout.get("components", [])
        if not isinstance(layout_id, str) or not layout_id.strip():
            raise SystemExit(f"{layout_description}.id precisa ser string nao vazia")
        if mode not in ("standard", "advanced"):
            raise SystemExit(f"{layout_description}.mode precisa ser standard ou advanced")
        if not isinstance(components, list):
            raise SystemExit(f"{layout_description}.components precisa ser lista")
        if len(components) > 64: raise SystemExit(f"{layout_description} excede 64 elementos")
        normalized_components = []
        component_ids = set()
        for component_index, component in enumerate(components):
            component_description = f"{layout_description}.components[{component_index}]"
            if not isinstance(component, dict):
                raise SystemExit(f"{component_description} precisa ser objeto")
            component_id = component.get("id")
            kind = component.get("kind")
            if not isinstance(component_id, str) or not component_id.strip():
                raise SystemExit(f"{component_description}.id precisa ser string nao vazia")
            if component_id in component_ids:
                raise SystemExit(f"{component_description}.id duplicado: {component_id}")
            if kind not in ("frame", "text", "bar", "icon"):
                raise SystemExit(f"{component_description}.kind invalido")
            component_ids.add(component_id)
            normalized = {}
            for key in ("label", "text", "asset"):
                field = component.get(key, "")
                if not isinstance(field, str):
                    raise SystemExit(f"{component_description}.{key} precisa ser string")
                normalized[key] = field
            for key in ("x", "y", "width", "height", "z_index"):
                field = component.get(key)
                if isinstance(field, bool) or not isinstance(field, int):
                    raise SystemExit(f"{component_description}.{key} precisa ser inteiro")
                if key in ("x", "y") and field < 0:
                    raise SystemExit(f"{component_description}.{key} nao pode ser negativo")
                if key in ("width", "height") and field <= 0:
                    raise SystemExit(f"{component_description}.{key} precisa ser positivo")
                normalized[key] = field
            visible = component.get("visible", True)
            if not isinstance(visible, bool):
                raise SystemExit(f"{component_description}.visible precisa ser booleano")
            normalized["id"] = component_id
            normalized["kind"] = kind
            normalized["visible"] = visible
            binding = component.get("value_binding")
            bindings = ("p1-health","p2-health","round-time","p1-rounds","p2-rounds","score","lives")
            if binding is not None:
                if binding not in bindings: raise SystemExit(f"{component_description}.value_binding invalido")
                normalized["value_binding"] = binding
            states = component.get("state_assets", [])
            if not isinstance(states,list) or len(states)>2 or any(not isinstance(item,str) or not item for item in states):
                raise SystemExit(f"{component_description}.state_assets precisa ter ate duas imagens")
            normalized["state_assets"] = states
            if "gauge" in component:
                gauge=component["gauge"]
                if kind!="bar" or binding is None or not isinstance(gauge,dict): raise SystemExit(f"{component_description}.gauge invalido")
                if not isinstance(gauge.get("empty_asset"),str) or not gauge["empty_asset"]: raise SystemExit(f"{component_description}.gauge.empty_asset invalido")
                for key in ("x","y","width","height"):
                    if isinstance(gauge.get(key),bool) or not isinstance(gauge.get(key),int) or gauge[key] < (1 if key in ("width","height") else 0):
                        raise SystemExit(f"{component_description}.gauge.{key} invalido")
                if gauge["x"]+gauge["width"]>normalized["width"] or gauge["y"]+gauge["height"]>normalized["height"]:
                    raise SystemExit(f"{component_description}.gauge fora da imagem")
                if not isinstance(gauge.get("reverse",False),bool): raise SystemExit(f"{component_description}.gauge.reverse invalido")
                normalized["gauge"]=gauge
            if "behavior" in component:
                normalized["behavior"] = hud_behavior_from_json(component["behavior"], component_description+".behavior")
            normalized_components.append(normalized)
        if sum("gauge" in component for component in normalized_components) > 2:
            raise SystemExit(f"{layout_description} excede duas barras dinamicas")
        if any(component["x"] + component["width"] > 240 or component["y"] + component["height"] > 160 for component in normalized_components):
            raise SystemExit(f"{layout_description}.components precisa caber no viewport 240x160")
        layouts.append({"id": layout_id, "mode": mode, "components": normalized_components})
    return layouts


def scene_interface_skins_from_json(items, base_dir, description):
    if not isinstance(items, list):
        raise SystemExit(f"{description} precisa ser lista")
    result = []
    for index, item in enumerate(items):
        label = f"{description}[{index}]"
        if not isinstance(item, dict) or not isinstance(item.get("scene_name"), str) or not item["scene_name"].strip():
            raise SystemExit(f"{label}.scene_name precisa ser string nao vazia")
        if any(existing["scene_name"] == item["scene_name"] for existing in result):
            raise SystemExit(f"{label}.scene_name duplicado: {item['scene_name']}")
        skins = {"scene_name": item["scene_name"]}
        for key in ("box_skin", "hud_skin"):
            if key in item:
                if not isinstance(item[key], str) or not item[key].strip():
                    raise SystemExit(f"{label}.{key} precisa ser caminho nao vazio")
                skins[key] = dialogue_box_skin_from_json(item[key], base_dir, f"{label}.{key}")
        result.append(skins)
    return result


def shared_dialogue_ui_assets_from_project(project_data, base_dir):
    selected_key = None
    selected_ui = None
    selected_contract = None
    selected_hud_contract = None
    for project_key in SHARED_DIALOGUE_UI_PROJECT_KEYS:
        runtime_project = project_data.get(project_key)
        if not isinstance(runtime_project, dict):
            continue
        dialogue_ui = runtime_project.get("dialogue_ui")
        if not isinstance(dialogue_ui, dict):
            continue
        contract = (
            dialogue_ui.get("box_skin"),
            dialogue_ui.get("hud_skin"),
            dialogue_ui.get("selector_skin"),
            dialogue_ui.get("font_image"),
            dialogue_ui.get("portrait_layout", "inline"),
        )
        scene_skins = scene_interface_skins_from_json(dialogue_ui.get("scene_skins", []), base_dir, f"{project_key}.dialogue_ui.scene_skins")
        hud_presets = dialogue_ui.get("hud_presets", [])
        hud_scene_bindings = dialogue_ui.get("hud_scene_bindings", [])
        hud_layouts = hud_layouts_from_json(dialogue_ui.get("hud_layouts", []), f"{project_key}.dialogue_ui.hud_layouts")
        active_hud_layout_id = dialogue_ui.get("hud_active_layout_id")
        if active_hud_layout_id is not None and (not isinstance(active_hud_layout_id, str) or not active_hud_layout_id.strip()):
            raise SystemExit(f"{project_key}.dialogue_ui.hud_active_layout_id precisa ser string nao vazia quando informado")
        if active_hud_layout_id is not None and not any(layout["id"] == active_hud_layout_id for layout in hud_layouts):
            raise SystemExit(f"{project_key}.dialogue_ui.hud_active_layout_id nao referencia um layout: {active_hud_layout_id}")
        if hud_presets is None:
            hud_presets = []
        if hud_scene_bindings is None:
            hud_scene_bindings = []
        if not isinstance(hud_presets, list):
            raise SystemExit(f"{project_key}.dialogue_ui.hud_presets precisa ser lista")
        if not isinstance(hud_scene_bindings, list):
            raise SystemExit(f"{project_key}.dialogue_ui.hud_scene_bindings precisa ser lista")
        hud_contract = (
            json.dumps(scene_skins, sort_keys=True),
            tuple(
                (
                    item.get("id") if isinstance(item, dict) else None,
                    item.get("hud_skin", item.get("hud_image")) if isinstance(item, dict) else None,
                    item.get("hud_position") if isinstance(item, dict) else None,
                    item.get("hud_width") if isinstance(item, dict) else None,
                    item.get("hud_height") if isinstance(item, dict) else None,
                )
                for item in hud_presets
            ),
            tuple(
                (
                    item.get("scene_name") if isinstance(item, dict) else None,
                    item.get("preset_id") if isinstance(item, dict) else None,
                )
                for item in hud_scene_bindings
            ),
            tuple(
                (
                    layout["id"],
                    layout["mode"],
                    tuple(
                        (
                            component["id"],
                            component["kind"],
                            component["label"],
                            component["text"],
                            component["asset"],
                            component["x"],
                            component["y"],
                            component["width"],
                            component["height"],
                            component["z_index"],
                            component["visible"],
                            json.dumps(component.get("behavior", {}), sort_keys=True),
                        )
                        for component in layout["components"]
                    ),
                )
                for layout in hud_layouts
            ),
            active_hud_layout_id,
        )
        if not any(isinstance(value, str) and value for value in contract):
            continue
        if selected_contract is not None and (contract != selected_contract or hud_contract != selected_hud_contract):
            raise SystemExit(
                f"{project_key}.dialogue_ui precisa usar a mesma UI de diálogo e os mesmos presets de HUD "
                f"de {selected_key}.dialogue_ui no runtime misto"
            )
        selected_key = project_key
        selected_ui = dialogue_ui
        selected_contract = contract
        selected_hud_contract = hud_contract

    if selected_ui is None:
        return None, None, None, None, dialogue_ui_from_json(None, "dialogue_ui"), hud_box_config_from_json(None), [], [], [], None, []

    box_skin = dialogue_box_skin_from_json(
        selected_ui.get("box_skin"),
        base_dir,
        f"{selected_key}.dialogue_ui.box_skin",
    )
    base_hud_skin_value = (
        selected_ui.get("hud_skin")
        if "hud_skin" in selected_ui
        else selected_ui.get("box_skin")
    )
    hud_skin = dialogue_box_skin_from_json(
        base_hud_skin_value,
        base_dir,
        f"{selected_key}.dialogue_ui.hud_skin",
    )
    selector = dialogue_choice_selector_from_json(
        selected_ui.get("selector_skin"),
        base_dir,
        f"{selected_key}.dialogue_ui.selector_skin",
        box_skin,
    )
    font = dialogue_font_from_json(
        selected_ui.get("font_image"),
        base_dir,
        f"{selected_key}.dialogue_ui.font_image",
    )
    hud_presets = []
    for preset_index, preset in enumerate(selected_ui.get("hud_presets", [])):
        description = f"{selected_key}.dialogue_ui.hud_presets[{preset_index}]"
        if not isinstance(preset, dict):
            raise SystemExit(f"{description} precisa ser objeto")
        preset_id = preset.get("id")
        if not isinstance(preset_id, str) or not preset_id.strip():
            raise SystemExit(f"{description}.id precisa ser string nao vazia")
        if any(item["id"] == preset_id for item in hud_presets):
            raise SystemExit(f"{description}.id duplicado: {preset_id}")
        if "hud_skin" in preset:
            skin_value = preset["hud_skin"]
        elif "hud_image" in preset:
            skin_value = preset["hud_image"]
        else:
            skin_value = base_hud_skin_value
        if skin_value is not None and (not isinstance(skin_value, str) or not skin_value):
            raise SystemExit(f"{description}.hud_skin precisa ser string nao vazia quando informado")
        skin = dialogue_box_skin_from_json(
            skin_value,
            base_dir,
            f"{description}.hud_skin",
        )
        font_value = preset.get("font_image", preset.get("font"))
        if font_value is not None and (not isinstance(font_value, str) or not font_value):
            raise SystemExit(f"{description}.font_image precisa ser string nao vazia quando informado")
        preset_font = dialogue_font_from_json(
            font_value,
            base_dir,
            f"{description}.font_image",
        )
        hud_presets.append({
            "id": preset_id,
            "skin": skin,
            "font": preset_font,
            "config": hud_box_config_from_json(preset),
        })

    hud_scene_bindings = []
    for binding_index, binding in enumerate(selected_ui.get("hud_scene_bindings", [])):
        description = f"{selected_key}.dialogue_ui.hud_scene_bindings[{binding_index}]"
        if not isinstance(binding, dict):
            raise SystemExit(f"{description} precisa ser objeto")
        scene_name = binding.get("scene_name")
        preset_id = binding.get("preset_id")
        if not isinstance(scene_name, str) or not scene_name.strip():
            raise SystemExit(f"{description}.scene_name precisa ser string nao vazia")
        if not isinstance(preset_id, str) or not preset_id.strip():
            raise SystemExit(f"{description}.preset_id precisa ser string nao vazia")
        if not any(item["id"] == preset_id for item in hud_presets):
            raise SystemExit(f"{description}.preset_id nao referencia um preset de HUD: {preset_id}")
        hud_scene_bindings.append({"scene_name": scene_name, "preset_id": preset_id})

    hud_layouts = hud_layouts_from_json(
        selected_ui.get("hud_layouts", []),
        f"{selected_key}.dialogue_ui.hud_layouts",
    )
    active_hud_layout_id = selected_ui.get("hud_active_layout_id")
    if active_hud_layout_id is not None and not any(layout["id"] == active_hud_layout_id for layout in hud_layouts):
        raise SystemExit(
            f"{selected_key}.dialogue_ui.hud_active_layout_id nao referencia um layout: {active_hud_layout_id}"
        )
    return box_skin, hud_skin, selector, font, dialogue_ui_from_json(selected_ui, f"{selected_key}.dialogue_ui"), hud_box_config_from_json(selected_ui), hud_presets, hud_scene_bindings, hud_layouts, active_hud_layout_id, scene_interface_skins_from_json(selected_ui.get("scene_skins", []), base_dir, "dialogue_ui.scene_skins")


def emit_shared_dialogue_ui_assets_header(box_skin, hud_skin, selector, font, dialogue_ui_config, hud_config, hud_presets=None, hud_scene_bindings=None, hud_layouts=None, active_hud_layout_id=None, asset_report=None, scene_skins=None):
    scene_skins = scene_skins or []
    hud_presets = hud_presets or []
    hud_scene_bindings = hud_scene_bindings or []
    hud_layouts = hud_layouts or []
    output = [
        "#pragma once",
        "",
        "#include <cstddef>",
        '#include "gbs/dialogue.hpp"',
        '#include "gbs/render.hpp"',
    ]
    hud_icon_headers = []
    for layout in hud_layouts:
        for component in layout.get("components", []):
            if component.get("kind") != "icon" and not (
                component.get("kind") in ("frame", "bar") and component.get("asset")
            ):
                continue
            asset_id = component.get("asset")
            for reference in [asset_id, *component.get("state_assets",[]), component.get("gauge",{}).get("empty_asset")]:
                header = asset_pack_header_map(asset_report).get(reference)
                if header is not None and header not in hud_icon_headers: hud_icon_headers.append(header)
    output.extend(f'#include "{header}"' for header in hud_icon_headers)
    output.extend(["", "namespace gbastudio_dialogue_ui {", ""])
    output.append(f"constexpr gbs::DialogueUiConfig dialogue_ui = {emit_dialogue_ui_literal(dialogue_ui_config)};")
    output.append("")
    emit_dialogue_box_skin(output, box_skin)
    emit_dialogue_box_skin(output, hud_skin, "hud_box_skin")
    emit_hud_box_config(output, hud_config)
    emit_dialogue_choice_selector(output, selector)
    emit_dialogue_font(output, font)
    for preset in hud_presets:
        preset_symbol = pack_safe_identifier(preset["id"])
        emit_dialogue_box_skin(
            output,
            preset["skin"],
            f"hud_preset_{preset_symbol}_skin",
        )
        emit_dialogue_font(output, preset["font"], f"hud_preset_{preset_symbol}_font")
    output.extend([
    ])
    for layout_index, layout in enumerate(hud_layouts):
        if layout["components"]:
            component_symbol = f"hud_layout_{pack_safe_identifier(layout['id'])}_{layout_index}_components"
            behavior_expressions = []
            for component_index, component in enumerate(layout["components"]):
                behavior = component.get("behavior", {"states":{}, "events":[]})
                symbol = f"{component_symbol}_{component_index}"
                event_expressions = []
                trigger_names = {"appear":"Appear", "valueChanged":"ValueChanged", "focus":"Focus", "confirm":"Confirm"}
                for event_index, event in enumerate(behavior["events"]):
                    action_symbol = f"{symbol}_event_{event_index}_actions"
                    output.append(f"constexpr gbs::HudVariableAction {action_symbol}[] = {{")
                    for action in event["actions"]:
                        output.append(f"    {{ {'true' if action['op']=='add_variable' else 'false'}, {action['variable']}, {action['value']} }},")
                    output.append("};")
                    event_expressions.append(f"{{ gbs::HudElementTrigger::{trigger_names[event['trigger']]}, {event.get('watch_variable',-1)}, {action_symbol}, {len(event['actions'])} }}")
                event_symbol = f"{symbol}_events"
                if event_expressions:
                    output.append(f"constexpr gbs::HudElementEvent {event_symbol}[] = {{ " + ", ".join(event_expressions) + " };")
                conditions = []
                for state_name in ("selected","disabled","hidden"):
                    condition = behavior["states"].get(state_name)
                    conditions.append("{}" if condition is None else "{ " + str(condition["variable"]) + ", " + str(condition["value"]) + ", " + (cpp_string_literal(condition["text"]) if "text" in condition else "nullptr") + " }")
                behavior_expressions.append("{ " + ", ".join(conditions) + ", " + (event_symbol if event_expressions else "nullptr") + ", " + str(len(event_expressions)) + " }")
            output.append(f"constexpr gbs::HudLayoutComponent {component_symbol}[] = {{")
            for component_index, component in enumerate(layout["components"]):
                metasprite = None
                if component["kind"] == "icon" or (
                    component["kind"] in ("frame", "bar") and component["asset"]
                ):
                    metasprite = asset_pack_member_symbol(asset_report, component["asset"], "metasprite")
                metasprite_expression = f"&{metasprite}" if metasprite is not None else "nullptr"
                binding_names={"p1-health":"P1Health","p2-health":"P2Health","round-time":"RoundTime","p1-rounds":"P1Rounds","p2-rounds":"P2Rounds","score":"Score","lives":"Lives"}
                binding="gbs::HudValueSource::"+binding_names.get(component.get("value_binding"),"None")
                gauge_expression="{}"
                if "gauge" in component:
                    gauge=component["gauge"]
                    full_tiles=asset_pack_member_symbol(asset_report,component["asset"],"tile_asset")
                    empty_tiles=asset_pack_member_symbol(asset_report,gauge["empty_asset"],"tile_asset")
                    if full_tiles is None or empty_tiles is None: raise SystemExit("HUD gauge image not in sprite pack")
                    gauge_expression=f"{{ &{full_tiles}, &{empty_tiles}, {gauge['x']}, {gauge['y']}, {gauge['width']}, {gauge['height']}, {'true' if gauge.get('reverse') else 'false'} }}"
                states=[]
                for reference in component.get("state_assets",[]):
                    state_symbol=asset_pack_member_symbol(asset_report,reference,"metasprite")
                    if state_symbol is None: raise SystemExit("HUD state image not in sprite pack")
                    states.append("&"+state_symbol)
                states += ["nullptr"]*(2-len(states))
                state_expression="{ "+", ".join(states)+" }"
                output.append(
                    f"    {{ {cpp_string_literal(component['id'])}, {cpp_string_literal(component['kind'])}, "
                    f"{cpp_string_literal(component['label'])}, {cpp_string_literal(component['text'])}, "
                    f"{cpp_string_literal(component['asset'])}, {component['x']}, {component['y']}, "
                    f"{component['width']}, {component['height']}, {component['z_index']}, "
                    f"{'true' if component['visible'] else 'false'}, {metasprite_expression}, {behavior_expressions[component_index]}, {binding}, {gauge_expression}, {state_expression} }},"
                )
            output.append("};")
        else:
            output.append(f"constexpr const gbs::HudLayoutComponent* hud_layout_{pack_safe_identifier(layout['id'])}_{layout_index}_components = nullptr;")
    if hud_layouts:
        output.append("constexpr gbs::HudLayout hud_layouts[] = {")
        for layout_index, layout in enumerate(hud_layouts):
            component_symbol = f"hud_layout_{pack_safe_identifier(layout['id'])}_{layout_index}_components"
            output.append(
                f"    {{ {cpp_string_literal(layout['id'])}, {cpp_string_literal(layout['mode'])}, "
                f"{component_symbol}, {len(layout['components'])} }},"
            )
        output.append("};")
        output.append(f"constexpr std::size_t hud_layout_count = {len(hud_layouts)};")
    else:
        output.append("constexpr const gbs::HudLayout* hud_layouts = nullptr;")
        output.append("constexpr std::size_t hud_layout_count = 0;")
    output.append(f"constexpr const char* active_hud_layout_id = {cpp_string_literal(active_hud_layout_id) if active_hud_layout_id else 'nullptr'};")
    output.extend([
        "struct HudPresetConfig {",
        "    const char* id;",
        "    const gbs::DialogueBoxSkin* skin;",
        "    const gbs::DialogueFont* font;",
        "    gbs::HudBoxConfig box;",
        "};",
    ])
    if hud_presets:
        output.append("constexpr HudPresetConfig hud_preset_configs[] = {")
        for preset in hud_presets:
            preset_symbol = pack_safe_identifier(preset["id"])
            skin_symbol = f"hud_preset_{preset_symbol}_skin"
            font_symbol = f"hud_preset_{preset_symbol}_font"
            config = preset["config"]
            output.append(
                f"    {{ {cpp_string_literal(preset['id'])}, {skin_symbol}, {font_symbol}, "
                f"gbs::HudBoxConfig {{ {config['x']}, {config['y']}, {config['width']}, {config['height']} }} }},"
            )
        output.append("};")
        output.append(f"constexpr std::size_t hud_preset_config_count = {len(hud_presets)};")
    else:
        output.append("constexpr const HudPresetConfig* hud_preset_configs = nullptr;")
        output.append("constexpr std::size_t hud_preset_config_count = 0;")
    output.append("")
    output.extend([
        "struct HudSceneBinding {",
        "    const char* scene_name;",
        "    const char* preset_id;",
        "};",
    ])
    if hud_scene_bindings:
        output.append("constexpr HudSceneBinding hud_scene_bindings[] = {")
        for binding in hud_scene_bindings:
            output.append(
                f"    {{ {cpp_string_literal(binding['scene_name'])}, {cpp_string_literal(binding['preset_id'])} }},"
            )
        output.append("};")
        output.append(f"constexpr std::size_t hud_scene_binding_count = {len(hud_scene_bindings)};")
    else:
        output.append("constexpr const HudSceneBinding* hud_scene_bindings = nullptr;")
        output.append("constexpr std::size_t hud_scene_binding_count = 0;")
    output.append("")
    # Deduplicate the actual tile/palette payload even when many scenes share a theme.
    skin_symbols = {}
    def scene_skin_symbol(skin):
        if skin is None:
            return "nullptr"
        key = json.dumps(skin, sort_keys=True)
        if key not in skin_symbols:
            symbol = f"scene_skin_{len(skin_symbols)}"
            skin_symbols[key] = symbol
            emit_dialogue_box_skin(output, skin, symbol)
        return skin_symbols[key]
    scene_entries = []
    for entry in scene_skins:
        scene_entries.append((entry["scene_name"], scene_skin_symbol(entry.get("box_skin")), scene_skin_symbol(entry.get("hud_skin"))))
    output.append("struct SceneSkin { const char* scene_name; const gbs::DialogueBoxSkin* box; const gbs::DialogueBoxSkin* hud; };")
    if scene_entries:
        output.append("constexpr SceneSkin scene_skins[] = {")
        for name, box, hud in scene_entries:
            output.append(f"    {{ {cpp_string_literal(name)}, {box}, {hud} }},")
        output.append("};")
    else:
        output.append("constexpr const SceneSkin* scene_skins = nullptr;")
    output.append(f"constexpr std::size_t scene_skin_count = {len(scene_entries)};")
    output.extend([
        "static inline bool scene_name_equals(const char* left, const char* right) {",
        "    if (left == nullptr || right == nullptr) return left == right;",
        "    while (*left != '\\0' && *left == *right) { ++left; ++right; }",
        "    return *left == '\\0' && *right == '\\0';",
        "}",
        "",
    ])
    output.append("static inline void load_hud_layout_images(const char* preset_id) {")
    output.append("    if (preset_id == nullptr) return;")
    for layout in hud_layouts:
        references = []
        for component in layout.get("components", []):
            if component.get("kind") not in ("frame", "bar", "icon"): continue
            for reference in [component.get("asset"), *component.get("state_assets", []), component.get("gauge", {}).get("empty_asset")]:
                if reference and reference not in references: references.append(reference)
        if not references: continue
        output.append(f"    if (scene_name_equals(preset_id, {cpp_string_literal(layout['id'])})) {{")
        for reference in references:
            tiles = asset_pack_member_symbol(asset_report, reference, "tile_asset")
            palette = asset_pack_member_symbol(asset_report, reference, "palette_asset")
            if tiles is not None: output.append(f"        gbs::load_tiles({tiles});")
            if palette is not None: output.append(f"        gbs::load_palette({palette}, true);")
        output.append("        return;")
        output.append("    }")
    output.append("}")
    output.extend([
        "",
        "static inline const HudPresetConfig* find_hud_preset(const char* preset_id) {",
        "    if (preset_id == nullptr) return nullptr;",
        "    for (std::size_t index = 0; index < hud_preset_config_count; ++index) {",
        "        if (scene_name_equals(hud_preset_configs[index].id, preset_id)) return &hud_preset_configs[index];",
        "    }",
        "    return nullptr;",
        "}",
        "",
        "static inline bool has_hud_scene_binding(const char* scene_name) {",
        "    if (scene_name == nullptr) return false;",
        "    for (std::size_t index = 0; index < hud_scene_binding_count; ++index) {",
        "        if (scene_name_equals(hud_scene_bindings[index].scene_name, scene_name)) return true;",
        "    }",
        "    return false;",
        "}",
        "",
        "static inline void configure() {",
        "    gbs::configure_dialogue_ui(dialogue_ui);",
        "    gbs::configure_dialogue_box_skin(dialogue_box_skin);",
        "    gbs::configure_hud_box_skin(hud_box_skin);",
        "    gbs::configure_hud_box(hud_box_config);",
        "    gbs::configure_hud_layouts(hud_layouts, hud_layout_count);",
        "    load_hud_layout_images(active_hud_layout_id);",
        "    gbs::configure_hud_layout(active_hud_layout_id);",
        "    gbs::configure_dialogue_choice_selector(dialogue_choice_selector);",
        "    gbs::configure_dialogue_font(dialogue_font);",
        "}",
        "",
        "static inline void configure_for_scene(const char* scene_name, bool force = false) {",
        "    static const char* configured_scene = nullptr;",
        "    if (!force && scene_name_equals(configured_scene, scene_name)) return;",
        "    configured_scene = scene_name;",
        "    configure();",
        "    if (scene_name == nullptr) return;",
        "    for (std::size_t index = 0; index < hud_scene_binding_count; ++index) {",
        "        if (!scene_name_equals(hud_scene_bindings[index].scene_name, scene_name)) continue;",
        "        const HudPresetConfig* preset = find_hud_preset(hud_scene_bindings[index].preset_id);",
        "        if (preset == nullptr) break;",
        "        gbs::configure_hud_box_skin(preset->skin);",
        "        gbs::configure_dialogue_font(preset->font != nullptr ? preset->font : dialogue_font);",
        "        gbs::configure_hud_box(preset->box);",
        "        load_hud_layout_images(preset->id);",
        "        gbs::configure_hud_layout(preset->id);",
        "        break;",
        "    }",
        "    for (std::size_t index = 0; index < scene_skin_count; ++index) {",
        "        const auto& skin = scene_skins[index];",
        "        if (!scene_name_equals(skin.scene_name, scene_name)) continue;",
        "        if (skin.box != nullptr) gbs::configure_dialogue_box_skin(skin.box);",
        "        if (skin.hud != nullptr) gbs::configure_hud_box_skin(skin.hud);",
        "        break;",
        "    }",
        "}",
        "",
        "} // namespace gbastudio_dialogue_ui",
        "",
    ])
    return "\n".join(output)


def emit_save_config(output, config):
    signature = config["signature"]
    ui = config["ui"]
    output.extend([
        f"constexpr bool save_enabled = {'true' if config['enabled'] else 'false'};",
        "constexpr gbs::SaveMenuConfig save_menu_config {",
        f"    {cpp_string_literal(ui['continue_label'])},",
        f"    {cpp_string_literal(ui['load_label'])},",
        f"    {cpp_string_literal(ui['delete_label'])},",
        f"    gbs::SaveMenuLayout::{'Cards' if ui['layout'] == 'cards' else 'List'},",
        f"    static_cast<uint8_t>({ui['selected_slot']}),",
        f"    {'true' if ui['confirm_delete'] else 'false'},",
        f"    {'true' if ui['show_player_name'] else 'false'}, {'true' if ui['show_play_time'] else 'false'}, {'true' if ui['show_location'] else 'false'},",
        f"    {'true' if ui['enabled'] else 'false'},",
        f"    {cpp_string_literal(ui['profile_id'])},",
        f"    {'true' if ui['custom_labels'] else 'false'}",
        "};",
        "constexpr gbs::SaveBank save_bank {",
        f"    static_cast<uint32_t>({config['offset']}),",
        f"    static_cast<uint32_t>({config['slot_capacity']}),",
        f"    static_cast<uint8_t>({config['slot_count']}),",
        f"    gbs::make_save_signature('{signature[0]}', '{signature[1]}', '{signature[2]}', '{signature[3]}'),",
        f"    static_cast<uint16_t>({config['version']})",
        "};",
        "",
    ])
    emit_runtime_capabilities(output, config.get("runtime_capabilities"), config["enabled"])
    output.extend([
        "inline gbs::RuntimeSaveService runtime_save_service {",
        "    save_bank,",
        "    &save_menu_config,",
        "    &runtime_capability_manifest,",
        "    1u",
        "};",
        "",
    ])


def emit_runtime_triggers(output, prefix, room, description):
    triggers = room.get("triggers", [])
    if not isinstance(triggers, list):
        raise SystemExit(f"{description}.triggers precisa ser lista")
    if not triggers:
        return ("nullptr", 0)

    entries = []
    for trigger_index, trigger in enumerate(triggers):
        trigger_path = f"{description}.triggers[{trigger_index}]"
        if not isinstance(trigger, dict):
            raise SystemExit(f"{trigger_path} precisa ser objeto")
        area = rect_from_json(trigger.get("area"), f"{trigger_path}.area")
        on_enter = emit_event_script(
            output,
            f"{prefix}_trigger_{trigger_index}_on_enter",
            trigger.get("on_enter", trigger.get("script")),
            f"{trigger_path}.on_enter",
        )
        on_leave = emit_event_script(
            output,
            f"{prefix}_trigger_{trigger_index}_on_leave",
            trigger.get("on_leave"),
            f"{trigger_path}.on_leave",
        )
        entries.append(
            "    gbs::RuntimeTriggerData { "
            f"gbs::Rect {{ {area[0]}, {area[1]}, {area[2]}, {area[3]} }}, "
            f"{on_enter}, {on_leave}, "
            f"{'true' if bool(trigger.get('run_once', False)) else 'false'}, "
            f"static_cast<uint16_t>({int(trigger.get('cooldown_frames', 0))}) "
            "},"
        )

    name = f"{prefix}_triggers"
    output.append(f"constexpr gbs::RuntimeTriggerData {name}[] = {{")
    output.extend(entries)
    output.append("};")
    output.append("")
    return (name, len(entries))


def emit_platformer_project_data_header(platformer_project, asset_report=None, base_dir=None):
    if not isinstance(platformer_project, dict):
        raise SystemExit("platformer_project precisa ser objeto")

    rooms = platformer_project.get("rooms")
    if not isinstance(rooms, list) or not rooms:
        raise SystemExit("platformer_project.rooms precisa ser lista nao vazia")

    initial_room = int(platformer_project.get("initial_room", 0))
    backdrop_color = int(platformer_project.get("backdrop_color", 0))
    player = platformer_project.get("player")
    if player is not None and not isinstance(player, dict):
        raise SystemExit("platformer_project.player precisa ser objeto quando informado")
    player_metasprite = resolve_project_metasprite_symbol(
        player.get("metasprite") if isinstance(player, dict) else None,
        None,
        asset_report,
        "platformer_project.player.metasprite",
    )
    player_metasprite_expr = f"&{player_metasprite}" if player_metasprite is not None else "nullptr"
    includes = merge_includes(
        string_list_from_json(platformer_project.get("includes", []), "platformer_project.includes"),
        project_auto_includes(platformer_project, asset_report),
    )
    save_config = save_config_from_json(platformer_project.get("save"), "platformer_project.save", "GBPF", 0)
    dialogue_ui = dialogue_ui_from_json(platformer_project.get("dialogue_ui"), "platformer_project.dialogue_ui")
    dialogue_ui_literal = emit_dialogue_ui_literal(dialogue_ui)

    output = [
        "#pragma once",
        "",
        '#include "gbs/engine.hpp"',
        '#include "gbs/platformer.hpp"',
    ]
    for include in includes:
        output.append(f'#include "{include}"')
    output.extend([
        "",
        "namespace gbastudio_platformer_project {",
        "",
    ])
    player_animation_set_expr = emit_platformer_player_animation_set(output, player, asset_report, base_dir)
    player_on_start = emit_event_script(
        output,
        "platformer_player_on_start",
        player.get("on_start") if isinstance(player, dict) else None,
        "platformer_project.player.on_start",
    )
    player_on_update = emit_event_script(
        output,
        "platformer_player_on_update",
        player.get("on_update") if isinstance(player, dict) else None,
        "platformer_project.player.on_update",
    )
    asset_refs = emit_project_asset_references(output, platformer_project, "platformer_project", "project", include_audio=True, asset_report=asset_report)
    emit_save_config(output, save_config)
    resource_banks_name, resource_bank_count, resource_bank_groups_name, resource_bank_group_count = emit_project_resource_banks(output, platformer_project, "platformer_project", asset_report)
    emit_resource_bank_upload_sources(output, asset_report)
    dialogue_lines_name, dialogue_line_count = emit_dialogue_lines(
        output,
        platformer_project.get("dialogue_lines", []),
        "platformer_project.dialogue_lines",
    )
    portrait_assets = dialogue_portrait_assets_from_json(
        platformer_project.get("portrait_assets"),
        "platformer_project.portrait_assets",
        asset_report,
    )
    emit_dialogue_portrait_assets(output, portrait_assets)
    emote_assets = dialogue_emote_assets_from_json(
        platformer_project.get("emote_assets"),
        "platformer_project.emote_assets",
        asset_report,
    )
    emit_dialogue_emote_assets(output, emote_assets)
    project_script_entries = []
    project_scripts = platformer_project.get("scripts", platformer_project.get("event_scripts", []))
    if project_scripts is None:
        project_scripts = []
    if not isinstance(project_scripts, list):
        raise SystemExit("platformer_project.scripts precisa ser lista")
    for script_index, script in enumerate(project_scripts):
        commands = script.get("script", script.get("commands", [])) if isinstance(script, dict) else script
        project_script_entries.append(emit_event_script(
            output,
            f"platformer_project_script_{script_index}",
            commands,
            f"platformer_project.scripts[{script_index}]",
        ))
    project_scripts_name = "nullptr"
    project_script_count = 0
    if project_script_entries:
        project_scripts_name = "project_scripts"
        project_script_count = len(project_script_entries)
        output.append("constexpr gbs::EventScript project_scripts[] = {")
        for script in project_script_entries:
            output.append(f"    {script},")
        output.append("};")
        output.append("")

    room_entries = []
    for room_index, room in enumerate(rooms):
        if not isinstance(room, dict):
            raise SystemExit(f"platformer_project.rooms[{room_index}] precisa ser objeto")
        width = int(room.get("width_tiles", 0))
        height = int(room.get("height_tiles", 0))
        if not has_valid_streaming_room_dimensions(width, height):
            raise SystemExit(f"platformer_project.rooms[{room_index}] dimensoes invalidas")
        tile_count = width * height
        prefix = pack_safe_identifier(room.get("name", f"room_{room_index}"))
        visual = int_list_from_json(
            room.get("visual_tiles"),
            tile_count,
            f"platformer_project.rooms[{room_index}].visual_tiles",
            maximum=0xFFFF,
        )
        visual = remap_platformer_visual_tiles_from_asset(room, visual, room_index, asset_report, base_dir)
        background_layers = room.get("background_layers", [])
        if background_layers is None:
            background_layers = []
        if not isinstance(background_layers, list):
            raise SystemExit(f"platformer_project.rooms[{room_index}].background_layers precisa ser lista")
        layer_tiles = {}
        layer_parallax = {}
        for layer_index, layer in enumerate(background_layers):
            description = f"platformer_project.rooms[{room_index}].background_layers[{layer_index}]"
            if not isinstance(layer, dict):
                raise SystemExit(f"{description} precisa ser objeto")
            layer_name = str(layer.get("layer", "")).lower()
            if layer_name not in ("bg3", "bg2", "bg1"):
                raise SystemExit(f"{description}.layer precisa ser bg3, bg2 ou bg1")
            if layer_name in layer_tiles:
                raise SystemExit(f"{description}.layer duplicada: {layer_name}")
            tiles = int_list_from_json(
                layer.get("tiles"),
                tile_count,
                f"{description}.tiles",
                maximum=0xFFFF,
            )
            layer_tiles[layer_name] = remap_platformer_layer_tiles_from_asset(
                layer,
                tiles,
                width,
                height,
                room_index,
                layer_index,
                asset_report,
                base_dir,
            )
            layer_parallax[layer_name] = vec2_from_json(
                layer.get("parallax", {"x": 256, "y": 256}),
                f"{description}.parallax",
            )
        if "bg2" in layer_tiles:
            visual = layer_tiles["bg2"]
        collision = int_list_from_json(
            room.get("collision_flags"),
            tile_count,
            f"platformer_project.rooms[{room_index}].collision_flags",
        )
        collision_slopes = int_list_from_json(
            room.get("collision_slopes", [0] * tile_count),
            tile_count,
            f"platformer_project.rooms[{room_index}].collision_slopes",
        )
        if any(value < 0 or value > 4 for value in collision_slopes):
            raise SystemExit(f"platformer_project.rooms[{room_index}].collision_slopes possui valor invalido")
        output.append(format_cpp_u16_array(f"{prefix}_visual_tiles", visual))
        output.append("")
        bg3_tiles_name = "nullptr"
        bg2_tiles_name = "nullptr"
        bg1_tiles_name = "nullptr"
        if "bg3" in layer_tiles:
            bg3_tiles_name = f"{prefix}_bg3_tiles"
            output.append(format_cpp_u16_array(bg3_tiles_name, layer_tiles["bg3"]))
            output.append("")
        if "bg2" in layer_tiles:
            bg2_tiles_name = f"{prefix}_bg2_tiles"
            output.append(f"constexpr const uint16_t* {bg2_tiles_name} = {prefix}_visual_tiles;")
            output.append("")
        if "bg1" in layer_tiles:
            bg1_tiles_name = f"{prefix}_bg1_tiles"
            output.append(format_cpp_u16_array(bg1_tiles_name, layer_tiles["bg1"]))
            output.append("")
        bg3_parallax = layer_parallax.get("bg3", (256, 256))
        output.append(format_cpp_u8_array(f"{prefix}_collision_flags", collision))
        output.append("")
        collision_slopes_name = "nullptr"
        if any(value != 0 for value in collision_slopes):
            collision_slopes_name = f"{prefix}_collision_slopes"
            slope_names = (
                "None",
                "BlockAboveRising",
                "BlockBelowRising",
                "BlockAboveFalling",
                "BlockBelowFalling",
            )
            output.append(f"constexpr gbs::TileSlope {collision_slopes_name}[] = {{")
            for value in collision_slopes:
                output.append(f"    gbs::TileSlope::{slope_names[value]},")
            output.append("};")
            output.append("")
        on_enter_script = emit_event_script(
            output,
            f"{prefix}_on_enter",
            room.get("on_enter"),
            f"platformer_project.rooms[{room_index}].on_enter",
        )
        on_exit_script = emit_event_script(
            output,
            f"{prefix}_on_exit",
            room.get("on_exit"),
            f"platformer_project.rooms[{room_index}].on_exit",
        )
        on_update_script = emit_event_script(
            output,
            f"{prefix}_on_update",
            room.get("on_update"),
            f"platformer_project.rooms[{room_index}].on_update",
        )
        on_hit_group_scripts = []
        for group_index in (1, 2, 3):
            on_hit_group_scripts.append(emit_event_script(
                output,
                f"{prefix}_on_hit_group{group_index}",
                room.get(f"on_hit_group{group_index}"),
                f"platformer_project.rooms[{room_index}].on_hit_group{group_index}",
            ))
        triggers_name, trigger_count = emit_runtime_triggers(
            output,
            prefix,
            room,
            f"platformer_project.rooms[{room_index}]",
        )

        hazards = room.get("hazards", [])
        if not isinstance(hazards, list):
            raise SystemExit(f"platformer_project.rooms[{room_index}].hazards precisa ser lista")
        hazards_name = "nullptr"
        hazard_count = 0
        hazard_event_entries = []
        hazard_event_sources = []
        if hazards:
            hazards_name = f"{prefix}_hazards"
            hazard_count = len(hazards)
            output.append(f"constexpr gbs::PlatformerHazard {hazards_name}[] = {{")
            for hazard_index, hazard in enumerate(hazards):
                if not isinstance(hazard, dict):
                    raise SystemExit(f"platformer_project.rooms[{room_index}].hazards[{hazard_index}] precisa ser objeto")
                area = rect_from_json(hazard.get("area"), f"platformer_project.rooms[{room_index}].hazards[{hazard_index}].area")
                output.append(
                    "    gbs::PlatformerHazard { "
                    f"gbs::Rect {{ {area[0]}, {area[1]}, {area[2]}, {area[3]} }}, "
                    f"static_cast<uint8_t>({int(hazard.get('damage', 1))}), "
                    f"{'true' if bool(hazard.get('respawn', True)) else 'false'} "
                    "},"
                )
                hazard_event_sources.append((hazard_index, hazard.get("on_hit", hazard.get("script"))))
            output.append("};")
            output.append("")
        for hazard_index, hazard_commands in hazard_event_sources:
            hazard_script = emit_event_script(
                output,
                f"{prefix}_hazard_{hazard_index}",
                hazard_commands,
                f"platformer_project.rooms[{room_index}].hazards[{hazard_index}].on_hit",
            )
            if hazard_script != "gbs::empty_event_script()":
                hazard_event_entries.append((hazard_index, hazard_script))
        hazard_events_name = "nullptr"
        hazard_event_count = 0
        if hazard_event_entries:
            hazard_events_name = f"{prefix}_hazard_events"
            hazard_event_count = len(hazard_event_entries)
            output.append(f"constexpr gbs::PlatformerHazardEventData {hazard_events_name}[] = {{")
            for hazard_index, hazard_script in hazard_event_entries:
                output.append(f"    gbs::PlatformerHazardEventData {{ {hazard_index}, {hazard_script} }},")
            output.append("};")
            output.append("")

        checkpoints = room.get("checkpoints", [])
        if not isinstance(checkpoints, list):
            raise SystemExit(f"platformer_project.rooms[{room_index}].checkpoints precisa ser lista")
        checkpoints_name = "nullptr"
        checkpoint_count = 0
        checkpoint_event_entries = []
        checkpoint_event_sources = []
        if checkpoints:
            checkpoints_name = f"{prefix}_checkpoints"
            checkpoint_count = len(checkpoints)
            output.append(f"constexpr gbs::PlatformerCheckpoint {checkpoints_name}[] = {{")
            for checkpoint_index, checkpoint in enumerate(checkpoints):
                if not isinstance(checkpoint, dict):
                    raise SystemExit(f"platformer_project.rooms[{room_index}].checkpoints[{checkpoint_index}] precisa ser objeto")
                area = rect_from_json(checkpoint.get("area"), f"platformer_project.rooms[{room_index}].checkpoints[{checkpoint_index}].area")
                respawn = vec2_from_json(
                    checkpoint.get("respawn_position", checkpoint.get("respawn_position_pixels", {"x": area[0], "y": area[1]})),
                    f"platformer_project.rooms[{room_index}].checkpoints[{checkpoint_index}].respawn_position",
                )
                output.append(
                    "    gbs::PlatformerCheckpoint { "
                    f"gbs::Rect {{ {area[0]}, {area[1]}, {area[2]}, {area[3]} }}, "
                    f"gbs::Vec2i {{ {respawn[0]}, {respawn[1]} }}, "
                    f"static_cast<uint16_t>({int(checkpoint.get('id', checkpoint_index + 1))}) "
                    "},"
                )
                checkpoint_id = int(checkpoint.get("id", checkpoint_index + 1))
                checkpoint_event_sources.append((checkpoint_index, checkpoint_id, checkpoint.get("on_activate", checkpoint.get("script"))))
            output.append("};")
            output.append("")
        for checkpoint_index, checkpoint_id, checkpoint_commands in checkpoint_event_sources:
            checkpoint_script = emit_event_script(
                output,
                f"{prefix}_checkpoint_{checkpoint_index}",
                checkpoint_commands,
                f"platformer_project.rooms[{room_index}].checkpoints[{checkpoint_index}].on_activate",
            )
            if checkpoint_script != "gbs::empty_event_script()":
                checkpoint_event_entries.append((checkpoint_id, checkpoint_script))
        checkpoint_events_name = "nullptr"
        checkpoint_event_count = 0
        if checkpoint_event_entries:
            checkpoint_events_name = f"{prefix}_checkpoint_events"
            checkpoint_event_count = len(checkpoint_event_entries)
            output.append(f"constexpr gbs::PlatformerCheckpointEventData {checkpoint_events_name}[] = {{")
            for checkpoint_id, checkpoint_script in checkpoint_event_entries:
                output.append(
                    "    gbs::PlatformerCheckpointEventData { "
                    f"static_cast<uint16_t>({checkpoint_id}), {checkpoint_script} "
                    "},"
                )
            output.append("};")
            output.append("")

        camera_zones = room.get("camera_zones", [])
        if not isinstance(camera_zones, list):
            raise SystemExit(f"platformer_project.rooms[{room_index}].camera_zones precisa ser lista")
        camera_zones_name = "nullptr"
        camera_zone_count = 0
        camera_zone_event_entries = []
        camera_zone_event_sources = []
        if camera_zones:
            camera_zones_name = f"{prefix}_camera_zones"
            camera_zone_count = len(camera_zones)
            output.append(f"constexpr gbs::PlatformerCameraZone {camera_zones_name}[] = {{")
            for zone_index, zone in enumerate(camera_zones):
                if not isinstance(zone, dict):
                    raise SystemExit(f"platformer_project.rooms[{room_index}].camera_zones[{zone_index}] precisa ser objeto")
                area = rect_from_json(zone.get("area"), f"platformer_project.rooms[{room_index}].camera_zones[{zone_index}].area")
                bounds = rect_from_json(
                    zone.get("bounds", zone.get("bounds_pixels", {"x": 0, "y": 0, "width": width * 8, "height": height * 8})),
                    f"platformer_project.rooms[{room_index}].camera_zones[{zone_index}].bounds",
                )
                offset = vec2_from_json(
                    zone.get("offset", zone.get("offset_pixels", {"x": 0, "y": 0})),
                    f"platformer_project.rooms[{room_index}].camera_zones[{zone_index}].offset",
                )
                output.append(
                    "    gbs::PlatformerCameraZone { "
                    f"gbs::Rect {{ {area[0]}, {area[1]}, {area[2]}, {area[3]} }}, "
                    f"gbs::Rect {{ {bounds[0]}, {bounds[1]}, {bounds[2]}, {bounds[3]} }}, "
                    f"gbs::Vec2i {{ {offset[0]}, {offset[1]} }}, "
                    f"{'true' if bool(zone.get('lock_x', False)) else 'false'}, "
                    f"{'true' if bool(zone.get('lock_y', False)) else 'false'} "
                    "},"
                )
                camera_zone_event_sources.append((zone_index, zone.get("on_enter", zone.get("script"))))
            output.append("};")
            output.append("")
        for zone_index, zone_commands in camera_zone_event_sources:
            zone_script = emit_event_script(
                output,
                f"{prefix}_camera_zone_{zone_index}",
                zone_commands,
                f"platformer_project.rooms[{room_index}].camera_zones[{zone_index}].on_enter",
            )
            if zone_script != "gbs::empty_event_script()":
                camera_zone_event_entries.append((zone_index, zone_script))
        camera_zone_events_name = "nullptr"
        camera_zone_event_count = 0
        if camera_zone_event_entries:
            camera_zone_events_name = f"{prefix}_camera_zone_events"
            camera_zone_event_count = len(camera_zone_event_entries)
            output.append(f"constexpr gbs::PlatformerCameraZoneEventData {camera_zone_events_name}[] = {{")
            for zone_index, zone_script in camera_zone_event_entries:
                output.append(f"    gbs::PlatformerCameraZoneEventData {{ {zone_index}, {zone_script} }},")
            output.append("};")
            output.append("")

        enemies = room.get("enemies", [])
        if not isinstance(enemies, list):
            raise SystemExit(f"platformer_project.rooms[{room_index}].enemies precisa ser lista")
        enemies_name = "nullptr"
        enemy_count = 0
        enemy_event_entries = []
        enemy_event_sources = []
        if enemies:
            enemies_name = f"{prefix}_enemies"
            enemy_count = len(enemies)
            output.append(f"constexpr gbs::PlatformerEnemy {enemies_name}[] = {{")
            for enemy_index, enemy in enumerate(enemies):
                if not isinstance(enemy, dict):
                    raise SystemExit(f"platformer_project.rooms[{room_index}].enemies[{enemy_index}] precisa ser objeto")
                bounds = rect_from_json(enemy.get("bounds", enemy.get("area")), f"platformer_project.rooms[{room_index}].enemies[{enemy_index}].bounds")
                patrol = rect_from_json(
                    enemy.get("patrol_bounds", enemy.get("bounds_pixels", {"x": bounds[0], "y": bounds[1], "width": bounds[2], "height": bounds[3]})),
                    f"platformer_project.rooms[{room_index}].enemies[{enemy_index}].patrol_bounds",
                )
                velocity = vec2_from_json(
                    enemy.get("velocity_x256", enemy.get("velocity", {"x": 256, "y": 0})),
                    f"platformer_project.rooms[{room_index}].enemies[{enemy_index}].velocity",
                )
                tile_index_expr, palette_expr = resolve_platformer_enemy_visual_exprs(
                    enemy,
                    asset_report,
                    f"platformer_project.rooms[{room_index}].enemies[{enemy_index}]",
                )
                output.append(
                    "    gbs::PlatformerEnemy { "
                    f"gbs::Rect {{ {bounds[0]}, {bounds[1]}, {bounds[2]}, {bounds[3]} }}, "
                    f"gbs::Rect {{ {patrol[0]}, {patrol[1]}, {patrol[2]}, {patrol[3]} }}, "
                    f"gbs::Vec2i {{ {velocity[0]}, {velocity[1]} }}, "
                    f"{'true' if bool(enemy.get('active', True)) else 'false'}, "
                    f"{'true' if bool(enemy.get('facing_right', True)) else 'false'}, "
                    f"static_cast<uint16_t>({int(enemy.get('damage', 1))}), "
                    f"static_cast<uint16_t>({int(enemy.get('script_index', 0))}), "
                    f"{tile_index_expr}, "
                    f"{palette_expr} "
                    "},"
                )
                enemy_event_sources.append((
                    enemy_index,
                    enemy.get("on_hit", enemy.get("on_touch", enemy.get("on_hit_player", enemy.get("script")))),
                ))
            output.append("};")
            output.append("")
            for enemy_index, enemy_commands in enemy_event_sources:
                enemy_script = emit_event_script(
                    output,
                    f"{prefix}_enemy_{enemy_index}_on_hit",
                    enemy_commands,
                    f"platformer_project.rooms[{room_index}].enemies[{enemy_index}].on_hit",
                )
                if enemy_script != "gbs::empty_event_script()":
                    enemy_event_entries.append((enemy_index, enemy_script))
        enemy_events_name = "nullptr"
        enemy_event_count = 0
        if enemy_event_entries:
            enemy_events_name = f"{prefix}_enemy_events"
            enemy_event_count = len(enemy_event_entries)
            output.append(f"constexpr gbs::PlatformerEnemyEventData {enemy_events_name}[] = {{")
            for enemy_index, script in enemy_event_entries:
                output.append(f"    gbs::PlatformerEnemyEventData {{ {enemy_index}, {script} }},")
            output.append("};")
            output.append("")

        moving_platforms = room.get("moving_platforms", room.get("platforms", []))
        if not isinstance(moving_platforms, list):
            raise SystemExit(f"platformer_project.rooms[{room_index}].moving_platforms precisa ser lista")
        moving_platforms_name = "nullptr"
        moving_platform_count = 0
        moving_platform_event_entries = []
        moving_platform_event_sources = []
        if moving_platforms:
            moving_platforms_name = f"{prefix}_moving_platforms"
            moving_platform_count = len(moving_platforms)
            output.append(f"constexpr gbs::PlatformerMovingPlatform {moving_platforms_name}[] = {{")
            for platform_index, platform in enumerate(moving_platforms):
                if not isinstance(platform, dict):
                    raise SystemExit(f"platformer_project.rooms[{room_index}].moving_platforms[{platform_index}] precisa ser objeto")
                bounds = rect_from_json(platform.get("bounds", platform.get("area")), f"platformer_project.rooms[{room_index}].moving_platforms[{platform_index}].bounds")
                start = vec2_from_json(
                    platform.get("start", platform.get("start_pixels", {"x": bounds[0], "y": bounds[1]})),
                    f"platformer_project.rooms[{room_index}].moving_platforms[{platform_index}].start",
                )
                end = vec2_from_json(
                    platform.get("end", platform.get("end_pixels", {"x": bounds[0], "y": bounds[1]})),
                    f"platformer_project.rooms[{room_index}].moving_platforms[{platform_index}].end",
                )
                velocity = vec2_from_json(
                    platform.get("velocity_x256", platform.get("velocity", {"x": 256, "y": 0})),
                    f"platformer_project.rooms[{room_index}].moving_platforms[{platform_index}].velocity",
                )
                tile_index_expr, palette_expr = resolve_platformer_platform_visual_exprs(
                    platform,
                    asset_report,
                    f"platformer_project.rooms[{room_index}].moving_platforms[{platform_index}]",
                )
                output.append(
                    "    gbs::PlatformerMovingPlatform { "
                    f"gbs::Rect {{ {bounds[0]}, {bounds[1]}, {bounds[2]}, {bounds[3]} }}, "
                    f"gbs::Vec2i {{ {start[0]}, {start[1]} }}, "
                    f"gbs::Vec2i {{ {end[0]}, {end[1]} }}, "
                    f"gbs::Vec2i {{ {velocity[0]}, {velocity[1]} }}, "
                    f"{'true' if bool(platform.get('active', True)) else 'false'}, "
                    f"{'true' if bool(platform.get('forward', True)) else 'false'}, "
                    f"static_cast<uint16_t>({int(platform.get('flags', 0))}), "
                    f"static_cast<uint16_t>({int(platform.get('script_index', 0))}), "
                    f"{tile_index_expr}, "
                    f"{palette_expr} "
                    "},"
                )
                moving_platform_event_sources.append((
                    platform_index,
                    platform.get("on_stand", platform.get("on_contact", platform.get("on_ride", platform.get("on_touch", platform.get("script"))))),
                ))
            output.append("};")
            output.append("")
            for platform_index, platform_commands in moving_platform_event_sources:
                platform_script = emit_event_script(
                    output,
                    f"{prefix}_moving_platform_{platform_index}_on_contact",
                    platform_commands,
                    f"platformer_project.rooms[{room_index}].moving_platforms[{platform_index}].on_contact",
                )
                if platform_script != "gbs::empty_event_script()":
                    moving_platform_event_entries.append((platform_index, platform_script))
        moving_platform_events_name = "nullptr"
        moving_platform_event_count = 0
        if moving_platform_event_entries:
            moving_platform_events_name = f"{prefix}_moving_platform_events"
            moving_platform_event_count = len(moving_platform_event_entries)
            output.append(f"constexpr gbs::PlatformerMovingPlatformEventData {moving_platform_events_name}[] = {{")
            for platform_index, script in moving_platform_event_entries:
                output.append(f"    gbs::PlatformerMovingPlatformEventData {{ {platform_index}, {script} }},")
            output.append("};")
            output.append("")

        npcs = room.get("npcs", [])
        if not isinstance(npcs, list):
            raise SystemExit(f"platformer_project.rooms[{room_index}].npcs precisa ser lista")
        npcs_name = "nullptr"
        npc_count = 0
        if npcs:
            npcs_name = f"{prefix}_npcs"
            npc_count = len(npcs)
            npc_lines = []
            for npc_index, npc in enumerate(npcs):
                description = f"platformer_project.rooms[{room_index}].npcs[{npc_index}]"
                if not isinstance(npc, dict):
                    raise SystemExit(f"{description} precisa ser objeto")
                position = vec2_from_json(npc.get("position", {"x": 0, "y": 0}), f"{description}.position")
                size = vec2_from_json(npc.get("size", {"x": 16, "y": 16}), f"{description}.size")
                collision_offset = vec2_from_json(
                    npc.get("collision_offset", {"x": 0, "y": 0}),
                    f"{description}.collision_offset",
                )
                metasprite = resolve_project_metasprite_symbol(
                    npc.get("metasprite"),
                    "generated_player_metasprite",
                    asset_report,
                    f"{description}.metasprite",
                )
                animation_expr, animation_table, animation_count, animation_lookup = emit_topdown_npc_animation_table(
                    output,
                    f"{prefix}_npc_{npc_index}",
                    npc,
                    asset_report,
                    description,
                    base_dir,
                )
                on_interact = emit_event_script(
                    output,
                    f"{prefix}_npc_{npc_index}_on_interact",
                    npc.get("on_interact", npc.get("script")),
                    f"{description}.on_interact",
                    animation_lookup=animation_lookup,
                )
                on_start = emit_event_script(
                    output,
                    f"{prefix}_npc_{npc_index}_on_start",
                    npc.get("on_start"),
                    f"{description}.on_start",
                    animation_lookup=animation_lookup,
                )
                on_update = emit_event_script(
                    output,
                    f"{prefix}_npc_{npc_index}_on_update",
                    npc.get("on_update"),
                    f"{description}.on_update",
                    animation_lookup=animation_lookup,
                )
                direction = topdown_actor_direction_from_json(npc.get("direction", "down"))
                facing = "Left" if direction in ("Left", "DownLeft", "UpLeft") else "Right"
                npc_name = cpp_string_literal(npc.get("name", f"{prefix}_npc_{npc_index}"))
                npc_lines.append(
                    "    gbs::PlatformerNpcData {\n"
                    f"        gbs::Vec2i {{ {position[0]}, {position[1]} }},\n"
                    f"        gbs::Vec2i {{ {size[0]}, {size[1]} }},\n"
                    f"        &{metasprite},\n"
                    f"        {animation_expr},\n"
                    f"        {on_interact},\n"
                    f"        {npc_name},\n"
                    f"        gbs::PlatformerFacing::{facing},\n"
                    f"        {int(npc.get('animation_speed_percent', 100))},\n"
                    f"        {on_start},\n"
                    f"        {on_update},\n"
                    f"        {animation_table},\n"
                    f"        {animation_count},\n"
                    f"        gbs::Vec2i {{ {collision_offset[0]}, {collision_offset[1]} }},\n"
                    f"        static_cast<uint8_t>({max(0, min(15, int(npc.get('collision_group', 0))))})\n"
                    "    },"
                )
            output.append(f"constexpr gbs::PlatformerNpcData {npcs_name}[] = {{")
            output.extend(npc_lines)
            output.append("};")
            output.append("")

        player_start = rect_from_json(
            room.get("player_start", platformer_project.get("player_start", {"x": 16, "y": 16, "width": 16, "height": 16})),
            f"platformer_project.rooms[{room_index}].player_start",
        )
        player_collision_offset = vec2_from_json(
            room.get("player_collision_offset", {"x": 0, "y": 0}),
            f"platformer_project.rooms[{room_index}].player_collision_offset",
        )
        camera = room.get("camera", room.get("camera_start", platformer_project.get("camera", {})))
        if camera is None:
            camera = {}
        if not isinstance(camera, dict):
            raise SystemExit(f"platformer_project.rooms[{room_index}].camera precisa ser objeto")
        camera_position = vec2_from_json(camera.get("position", {"x": 0, "y": 0}), f"platformer_project.rooms[{room_index}].camera.position")
        camera_follow = bool(camera.get("follow_player", True))
        config = platformer_config_from_json(
            room.get("config", platformer_project.get("config", {})),
            f"platformer_project.rooms[{room_index}].config",
        )
        room_name = cpp_string_literal(room.get("name", f"room_{room_index}"))
        room_bank_group = room.get("resource_bank_group", room.get("bank_group", None))
        if room_bank_group is not None and not isinstance(room_bank_group, str):
            raise SystemExit(f"platformer_project.rooms[{room_index}].resource_bank_group precisa ser string")
        room_bank_group_literal = cpp_string_literal(room_bank_group) if room_bank_group else "nullptr"
        room_video_literal = room_video_composition_literal(
            room,
            f"platformer_project.rooms[{room_index}]",
            asset_report,
        )
        room_entries.append(
            "    gbs::PlatformerRoomData {\n"
            f"        {prefix}_visual_tiles,\n"
            f"        {prefix}_collision_flags,\n"
            f"        {collision_slopes_name},\n"
            f"        {width},\n"
            f"        {height},\n"
            f"        gbs::Rect {{ {player_start[0]}, {player_start[1]}, {player_start[2]}, {player_start[3]} }},\n"
            f"        gbs::Camera {{ gbs::Vec2i {{ {camera_position[0]}, {camera_position[1]} }}, {'true' if camera_follow else 'false'} }},\n"
            f"        {emit_platformer_config(config)},\n"
            f"        {hazards_name},\n"
            f"        {hazard_count},\n"
            f"        {checkpoints_name},\n"
            f"        {checkpoint_count},\n"
            f"        {camera_zones_name},\n"
            f"        {camera_zone_count},\n"
            f"        {room_name},\n"
            f"        {on_enter_script},\n"
            f"        {on_exit_script},\n"
            f"        {on_update_script},\n"
            f"        {hazard_events_name},\n"
            f"        {hazard_event_count},\n"
            f"        {checkpoint_events_name},\n"
            f"        {checkpoint_event_count},\n"
            f"        {camera_zone_events_name},\n"
            f"        {camera_zone_event_count},\n"
            f"        {room_bank_group_literal},\n"
            f"        {enemies_name},\n"
            f"        {enemy_count},\n"
            f"        {moving_platforms_name},\n"
            f"        {moving_platform_count},\n"
            f"        {enemy_events_name},\n"
            f"        {enemy_event_count},\n"
            f"        {moving_platform_events_name},\n"
            f"        {moving_platform_event_count},\n"
            f"        {triggers_name},\n"
            f"        {trigger_count},\n"
            f"        {npcs_name},\n"
            f"        {npc_count},\n"
            f"        gbs::Vec2i {{ {player_collision_offset[0]}, {player_collision_offset[1]} }},\n"
            f"        {bg3_tiles_name},\n"
            f"        {bg2_tiles_name},\n"
            f"        {bg1_tiles_name},\n"
            f"        gbs::Vec2i {{ {bg3_parallax[0]}, {bg3_parallax[1]} }},\n"
            f"        {room_video_literal},\n"
            f"        {on_hit_group_scripts[0]},\n"
            f"        {on_hit_group_scripts[1]},\n"
            f"        {on_hit_group_scripts[2]}\n"
            "    }"
        )

    output.append("constexpr gbs::PlatformerRoomData rooms[] = {")
    output.append(",\n".join(room_entries))
    output.append("};")
    output.append("")
    output.extend([
        "const gbs::PlatformerProjectData project {",
        f"    {asset_refs['bg_palettes'][0]},",
        f"    {asset_refs['bg_palettes'][1]},",
        f"    {asset_refs['obj_palettes'][0]},",
        f"    {asset_refs['obj_palettes'][1]},",
        f"    {asset_refs['tile_assets'][0]},",
        f"    {asset_refs['tile_assets'][1]},",
        "    rooms,",
        f"    {len(rooms)},",
        f"    {initial_room},",
        f"    static_cast<uint16_t>({backdrop_color}),",
        f"    {resource_banks_name},",
        f"    {resource_bank_count},",
        f"    {resource_bank_groups_name},",
        f"    {resource_bank_group_count},",
        f"    {project_scripts_name},",
        f"    {project_script_count},",
        f"    {dialogue_lines_name},",
        f"    {dialogue_line_count},",
        f"    {asset_refs['sfx_assets'][0]},",
        f"    {asset_refs['sfx_assets'][1]},",
        f"    {asset_refs['music_assets'][0]},",
        f"    {asset_refs['music_assets'][1]},",
        f"    {asset_refs['pcm_assets'][0]},",
        f"    {asset_refs['pcm_assets'][1]},",
        f"    {asset_refs['tracker_assets'][0]},",
        f"    {asset_refs['tracker_assets'][1]},",
        f"    {dialogue_ui_literal},",
        f"    {player_metasprite_expr},",
        f"    {player_animation_set_expr},",
        f"    {player_on_start},",
        f"    {player_on_update}",
        "};",
        "",
        "} // namespace gbastudio_platformer_project",
        "",
    ])
    return "\n".join(output)


def emit_iso_grid_config(grid, description):
    if grid is None:
        grid = {}
    if not isinstance(grid, dict):
        raise SystemExit(f"{description} precisa ser objeto")
    origin = vec2_from_json(grid.get("origin", grid.get("origin_pixels", {"x": 120, "y": 16})), f"{description}.origin")
    return (
        "gbs::IsoGridConfig { "
        f"{int(grid.get('tile_width_pixels', grid.get('tile_width', 32)))}, "
        f"{int(grid.get('tile_height_pixels', grid.get('tile_height', 16)))}, "
        f"gbs::Vec2i {{ {origin[0]}, {origin[1]} }}, "
        f"{int(grid.get('height_step_pixels', grid.get('height_step', 8)))} "
        "}"
    )


def emit_iso_camera(camera, description):
    if camera is None:
        camera = {}
    if not isinstance(camera, dict):
        raise SystemExit(f"{description} precisa ser objeto")
    position = vec2_from_json(camera.get("position", camera.get("position_pixels", {"x": 0, "y": 0})), f"{description}.position")
    bounds_value = camera.get("bounds", camera.get("bounds_pixels", {"x": 0, "y": 0, "width": 0, "height": 0}))
    bounds = rect_from_json(bounds_value, f"{description}.bounds")
    bounds_enabled = bool(camera.get("bounds_enabled", camera.get("use_bounds", bounds[2] > 0 and bounds[3] > 0)))
    zoom_x256 = max(128, min(1024, int(camera.get("zoom_x256", 256))))
    target_zoom_x256 = max(128, min(1024, int(camera.get("target_zoom_x256", zoom_x256))))
    smoothing_x256 = max(1, min(256, int(camera.get("smoothing_x256", 256))))
    dead_zone = rect_from_json(
        camera.get("dead_zone", camera.get("dead_zone_screen_pixels", {"x": 120, "y": 80, "width": 0, "height": 0})),
        f"{description}.dead_zone",
    )
    pan = vec2_from_json(camera.get("pan", camera.get("pan_offset_pixels", {"x": 0, "y": 0})), f"{description}.pan")
    return (
        "gbs::IsoCamera { "
        f"gbs::Vec2i {{ {position[0]}, {position[1]} }}, "
        f"gbs::Rect {{ {bounds[0]}, {bounds[1]}, {bounds[2]}, {bounds[3]} }}, "
        f"{'true' if bounds_enabled else 'false'}, "
        f"{zoom_x256}, {target_zoom_x256}, "
        f"{'true' if bool(camera.get('follow_enabled', camera.get('follow_player', True))) else 'false'}, "
        f"{smoothing_x256}, "
        f"gbs::Rect {{ {dead_zone[0]}, {dead_zone[1]}, {dead_zone[2]}, {dead_zone[3]} }}, "
        f"gbs::Vec2i {{ {pan[0]}, {pan[1]} }} "
        "}"
    )


def dungeon_direction_expr(value, description):
    normalized = str(value or "north").strip().lower()
    directions = {
        "north": "gbs::DungeonDirection::North",
        "up": "gbs::DungeonDirection::North",
        "east": "gbs::DungeonDirection::East",
        "right": "gbs::DungeonDirection::East",
        "south": "gbs::DungeonDirection::South",
        "down": "gbs::DungeonDirection::South",
        "west": "gbs::DungeonDirection::West",
        "left": "gbs::DungeonDirection::West",
    }
    if normalized not in directions:
        raise SystemExit(f"{description} direcao invalida: {value}")
    return directions[normalized]


def emit_advanced_runtime_backgrounds(output, project, description, cpp_type, array_name, asset_report=None):
    backgrounds = project.get("backgrounds", [])
    if backgrounds is None:
        backgrounds = []
    if not isinstance(backgrounds, list):
        raise SystemExit(f"{description}.backgrounds precisa ser lista")
    if not backgrounds:
        return ("nullptr", 0)
    output.append(f"constexpr {cpp_type} {array_name}[] = {{")
    for index, background in enumerate(backgrounds):
        if not isinstance(background, dict):
            raise SystemExit(f"{description}.backgrounds[{index}] precisa ser objeto")
        tilemap = background.get("tilemap", background.get("tilemap_asset"))
        if not isinstance(tilemap, str) or not tilemap:
            raise SystemExit(f"{description}.backgrounds[{index}].tilemap precisa ser string")
        tilemap_symbol = resolve_project_asset_symbol(
            tilemap,
            "tilemap",
            asset_report,
            f"{description}.backgrounds[{index}].tilemap",
        )
        if bool(background.get("backdrop_from_tilemap_palette", False)):
            palette_symbol = resolve_project_asset_symbol(
                tilemap,
                "palette_asset",
                asset_report,
                f"{description}.backgrounds[{index}].tilemap",
            )
            backdrop_color = f"{palette_symbol}.colors[0]"
        else:
            backdrop_color = str(int(background.get("backdrop_color", 0)))
        layer = background_layer_from_json(background.get("layer", "bg2"))
        output.append(
            f"    {cpp_type} {{ "
            f"gbs::BackgroundLayer::{layer}, {tilemap_symbol}, "
            f"static_cast<uint16_t>({backdrop_color}) "
            "},"
        )
    output.append("};")
    output.append("")
    return (array_name, len(backgrounds))


def emit_advanced_runtime_actors(output, room, room_index, description, cpp_type, prefix, asset_report=None, pixel_positions=False):
    actors = room.get("actors", [])
    if actors is None:
        actors = []
    if not isinstance(actors, list):
        raise SystemExit(f"{description}.actors precisa ser lista")
    if not actors:
        return ("nullptr", 0)
    supports_depth_metasprites = prefix == "dungeon"
    entries = []
    for actor_index, actor in enumerate(actors):
        actor_path = f"{description}.actors[{actor_index}]"
        if not isinstance(actor, dict):
            raise SystemExit(f"{actor_path} precisa ser objeto")
        position_key = "position_pixels" if pixel_positions else "position"
        position = actor.get(position_key, {})
        if not isinstance(position, dict):
            raise SystemExit(f"{actor_path}.{position_key} precisa ser objeto")
        metasprite_symbol = resolve_project_metasprite_symbol(
            actor.get("metasprite"),
            None,
            asset_report,
            f"{actor_path}.metasprite",
        )
        if metasprite_symbol is None:
            raise SystemExit(f"{actor_path}.metasprite precisa referenciar asset valido")
        depth_pointer = "nullptr"
        depth_metasprites = actor.get("depth_metasprites")
        if depth_metasprites is not None and not supports_depth_metasprites:
            raise SystemExit(f"{actor_path}.depth_metasprites so e suportado apenas pelo dungeon crawler")
        if supports_depth_metasprites and depth_metasprites is not None:
            if not isinstance(depth_metasprites, dict):
                raise SystemExit(f"{actor_path}.depth_metasprites precisa ser objeto")
            depth_symbols = {}
            for variant in ("far", "mid", "near"):
                depth_symbol = resolve_project_metasprite_symbol(
                    depth_metasprites.get(variant),
                    None,
                    asset_report,
                    f"{actor_path}.depth_metasprites.{variant}",
                )
                if depth_symbol is None:
                    raise SystemExit(f"{actor_path}.depth_metasprites.{variant} precisa referenciar asset valido")
                depth_symbols[variant] = depth_symbol
            depth_name = f"{prefix}_room_{room_index}_actor_{actor_index}_depth_sprites"
            output.append(
                f"constexpr gbs::DungeonCrawlerDepthSprites {depth_name} {{ "
                f"&{depth_symbols['far']}, &{depth_symbols['mid']}, &{depth_symbols['near']} "
                "};"
            )
            depth_pointer = f"&{depth_name}"
        on_interact = emit_event_script(
            output,
            f"{prefix}_room_{room_index}_actor_{actor_index}_on_interact",
            actor.get("on_interact"),
            f"{actor_path}.on_interact",
        )
        depth_suffix = f", {depth_pointer}" if supports_depth_metasprites else ""
        entries.append(
            f"    {cpp_type} {{ "
            f"{cpp_string_literal(actor.get('name', f'actor_{actor_index}'))}, "
            f"gbs::Vec2i {{ {int(position.get('x', 0))}, {int(position.get('y', 0))} }}, "
            f"&{metasprite_symbol}, {on_interact}{depth_suffix} "
            "},"
        )
    array_name = f"{prefix}_room_{room_index}_actors"
    output.append(f"constexpr {cpp_type} {array_name}[] = {{")
    output.extend(entries)
    output.append("};")
    output.append("")
    return (array_name, len(entries))


def emit_dungeon_crawler_project_data_header(dungeon_project, asset_report=None):
    if not isinstance(dungeon_project, dict):
        raise SystemExit("dungeon_crawler_project precisa ser objeto")
    rooms = dungeon_project.get("rooms")
    if not isinstance(rooms, list) or not rooms:
        raise SystemExit("dungeon_crawler_project.rooms precisa ser lista nao vazia")

    output = [
        "#pragma once",
        "#include <stddef.h>",
        "#include <stdint.h>",
        "#include \"gbs/dungeon_crawler.hpp\"",
        "#include \"gbs/runtime_save_restore.hpp\"",
    ]
    for include in merge_includes(
        string_list_from_json(dungeon_project.get("includes", []), "dungeon_crawler_project.includes"),
        project_auto_includes(dungeon_project, asset_report),
    ):
        output.append(f"#include {cpp_string_literal(include)}")
    output.extend(["", "namespace gbastudio_dungeon_crawler_project {", ""])
    asset_refs = emit_project_asset_references(output, dungeon_project, "dungeon_crawler_project", "dungeon_crawler_project", include_audio=True, asset_report=asset_report)
    save_config = save_config_from_json(
        dungeon_project.get("save"),
        "dungeon_crawler_project.save",
        "GBUS",
        0,
    )
    emit_save_config(output, save_config)
    resource_banks_name, resource_bank_count, resource_bank_groups_name, resource_bank_group_count = emit_project_resource_banks(
        output,
        dungeon_project,
        "dungeon_crawler_project",
        asset_report,
    )
    resource_bank_upload_sources_name, resource_bank_upload_source_count = emit_resource_bank_upload_sources(output, asset_report)
    backgrounds_name, background_count = emit_advanced_runtime_backgrounds(
        output,
        dungeon_project,
        "dungeon_crawler_project",
        "gbs::DungeonCrawlerBackgroundData",
        "dungeon_crawler_backgrounds",
        asset_report,
    )
    dialogue_lines_name, dialogue_line_count = emit_dialogue_lines(
        output,
        dungeon_project.get("dialogue_lines", []),
        "dungeon_crawler_project.dialogue_lines",
    )
    project_scripts = dungeon_project.get("scripts", dungeon_project.get("event_scripts", []))
    if project_scripts is None:
        project_scripts = []
    if not isinstance(project_scripts, list):
        raise SystemExit("dungeon_crawler_project.scripts precisa ser lista")
    project_script_entries = []
    for script_index, script in enumerate(project_scripts):
        commands = script.get("script", script.get("commands", [])) if isinstance(script, dict) else script
        project_script_entries.append(emit_event_script(
            output,
            f"dungeon_crawler_project_script_{script_index}",
            commands,
            f"dungeon_crawler_project.scripts[{script_index}]",
        ))
    project_scripts_name = "nullptr"
    project_script_count = 0
    if project_script_entries:
        project_scripts_name = "project_scripts"
        project_script_count = len(project_script_entries)
        output.append("constexpr gbs::EventScript project_scripts[] = {")
        for script in project_script_entries:
            output.append(f"    {script},")
        output.append("};")
        output.append("")
    inventory_items = dungeon_project.get("inventory_items", [])
    if inventory_items is None:
        inventory_items = []
    if not isinstance(inventory_items, list):
        raise SystemExit("dungeon_crawler_project.inventory_items precisa ser lista")
    inventory_items_name = "nullptr"
    inventory_item_count = 0
    if inventory_items:
        inventory_entries = []
        for item_index, item in enumerate(inventory_items):
            if not isinstance(item, dict):
                raise SystemExit(
                    f"dungeon_crawler_project.inventory_items[{item_index}] precisa ser objeto"
                )
            label = item.get("label", "ITEM")
            if not isinstance(label, str) or not label:
                raise SystemExit(
                    f"dungeon_crawler_project.inventory_items[{item_index}].label precisa ser string nao vazia"
                )
            inventory_entries.append(
                "    gbs::DungeonCrawlerInventoryItemData { "
                f"{cpp_string_literal(label)}, {int(item.get('item', 0))}, "
                f"{int(item.get('initial_quantity', 1))}, {int(item.get('heal_amount', 1))} "
                "},"
            )
        inventory_items_name = "dungeon_inventory_items"
        inventory_item_count = len(inventory_entries)
        output.append(f"constexpr gbs::DungeonCrawlerInventoryItemData {inventory_items_name}[] = {{")
        output.extend(inventory_entries)
        output.append("};")
        output.append("")

    battle = dungeon_project.get("battle")
    if battle is None:
        battle = {}
    if not isinstance(battle, dict):
        raise SystemExit("dungeon_crawler_project.battle precisa ser objeto")
    battle_name = battle.get("enemy_name")
    if battle_name is None:
        battle_expr = "gbs::DungeonCrawlerBattleData { nullptr, -1, 0, 0, 0, -1, 0 }"
    else:
        if not isinstance(battle_name, str) or not battle_name:
            raise SystemExit("dungeon_crawler_project.battle.enemy_name precisa ser string nao vazia")
        battle_expr = (
            "gbs::DungeonCrawlerBattleData { "
            f"{cpp_string_literal(battle_name)}, {int(battle.get('enemy_actor_index', -1))}, "
            f"{int(battle.get('max_hp', 0))}, {int(battle.get('player_damage', 0))}, "
            f"{int(battle.get('enemy_damage', 0))}, {int(battle.get('reward_item', -1))}, "
            f"{int(battle.get('reward_quantity', 0))} "
            "}"
        )
    room_entries = []
    for room_index, room in enumerate(rooms):
        if not isinstance(room, dict):
            raise SystemExit(f"dungeon_crawler_project.rooms[{room_index}] precisa ser objeto")
        width = int(room.get("width_tiles", room.get("width", 0)))
        height = int(room.get("height_tiles", room.get("height", 0)))
        if width <= 0 or height <= 0:
            raise SystemExit(f"dungeon_crawler_project.rooms[{room_index}] dimensoes invalidas")
        flags = int_list_from_json(
            room.get("collision_flags", []),
            width * height,
            f"dungeon_crawler_project.rooms[{room_index}].collision_flags",
        )
        flags_name = f"dungeon_room_{room_index}_collision_flags"
        output.append(f"constexpr uint8_t {flags_name}[] = {{")
        output.append("    " + ", ".join(str(1 if int(value) else 0) for value in flags))
        output.append("};")
        output.append("")

        config = room.get("config", {})
        if not isinstance(config, dict):
            raise SystemExit(f"dungeon_crawler_project.rooms[{room_index}].config precisa ser objeto")
        player = room.get("player_start", {})
        if not isinstance(player, dict):
            raise SystemExit(f"dungeon_crawler_project.rooms[{room_index}].player_start precisa ser objeto")
        on_enter = emit_event_script(
            output,
            f"dungeon_room_{room_index}_on_enter",
            room.get("on_enter"),
            f"dungeon_crawler_project.rooms[{room_index}].on_enter",
        )
        triggers_name, trigger_count = emit_runtime_triggers(
            output,
            f"dungeon_room_{room_index}",
            room,
            f"dungeon_crawler_project.rooms[{room_index}]",
        )
        actors_name, actor_count = emit_advanced_runtime_actors(
            output,
            room,
            room_index,
            f"dungeon_crawler_project.rooms[{room_index}]",
            "gbs::DungeonCrawlerActorData",
            "dungeon",
            asset_report,
        )
        resource_group = room.get("resource_bank_group", room.get("bank_group"))
        if resource_group is not None and (
            not isinstance(resource_group, str) or not resource_group
        ):
            raise SystemExit(
                f"dungeon_crawler_project.rooms[{room_index}].resource_bank_group precisa ser string nao vazia"
            )
        resource_group_expr = (
            cpp_string_literal(resource_group)
            if isinstance(resource_group, str)
            else "nullptr"
        )
        room_video_literal = room_video_composition_literal(
            room,
            f"dungeon_crawler_project.rooms[{room_index}]",
            asset_report,
        )
        room_entries.append(
            "    gbs::DungeonCrawlerRoomData { "
            f"{cpp_string_literal(room.get('name', f'room_{room_index}'))}, "
            f"{flags_name}, {width}, {height}, "
            "gbs::DungeonCrawlerConfig { "
            f"{int(config.get('step_duration_frames', 11))}, "
            f"{int(config.get('turn_duration_frames', 7))}, "
            f"{'true' if bool(config.get('allow_backstep', True)) else 'false'}, "
            f"{int(config.get('view_distance', 5))} "
            "}, "
            f"gbs::Vec2i {{ {int(player.get('x', 1))}, {int(player.get('y', 1))} }}, "
            f"{dungeon_direction_expr(player.get('direction', 'north'), f'dungeon_crawler_project.rooms[{room_index}].player_start')}, "
            f"{on_enter}, "
            f"{int(room.get('background', room.get('background_index', -1)))}, "
            f"{triggers_name}, {trigger_count}, "
            f"{actors_name}, {actor_count}, "
            f"{resource_group_expr}, "
            f"{'true' if bool(room.get('battle_enabled', False)) else 'false'}, "
            f"{room_video_literal} "
            "},"
        )

    output.append("constexpr gbs::DungeonCrawlerRoomData rooms[] = {")
    output.extend(room_entries)
    output.append("};")
    output.append("")
    output.extend([
        "constexpr gbs::DungeonCrawlerProjectData project {",
        "    rooms,",
        f"    {len(rooms)},",
        f"    {int(dungeon_project.get('initial_room', 0))},",
        f"    {dialogue_lines_name},",
        f"    {dialogue_line_count},",
        f"    {asset_refs['bg_palettes'][0]},",
        f"    {asset_refs['bg_palettes'][1]},",
        f"    {asset_refs['obj_palettes'][0]},",
        f"    {asset_refs['obj_palettes'][1]},",
        f"    {asset_refs['tile_assets'][0]},",
        f"    {asset_refs['tile_assets'][1]},",
        f"    {backgrounds_name},",
        f"    {background_count},",
        f"    {asset_refs['sfx_assets'][0]},",
        f"    {asset_refs['sfx_assets'][1]},",
        f"    {asset_refs['music_assets'][0]},",
        f"    {asset_refs['music_assets'][1]},",
        f"    {asset_refs['tracker_assets'][0]},",
        f"    {asset_refs['tracker_assets'][1]},",
        f"    {asset_refs['pcm_assets'][0]},",
        f"    {asset_refs['pcm_assets'][1]},",
        f"    {resource_banks_name},",
        f"    {resource_bank_count},",
        f"    {resource_bank_groups_name},",
        f"    {resource_bank_group_count},",
        f"    {resource_bank_upload_sources_name},",
        f"    {resource_bank_upload_source_count},",
        f"    {'true' if bool(dungeon_project.get('inventory_enabled', True)) else 'false'},",
        f"    {'true' if bool(dungeon_project.get('battle_enabled', True)) else 'false'},",
        f"    {'true' if bool(dungeon_project.get('depth_sprites_enabled', True)) else 'false'},",
        f"    {inventory_items_name},",
        f"    {inventory_item_count},",
        f"    {battle_expr},",
        f"    {'true' if bool(dungeon_project.get('compass_enabled', False)) else 'false'},",
        f"    {'true' if bool(dungeon_project.get('map_enabled', False)) else 'false'},",
        f"    {project_scripts_name},",
        f"    {project_script_count}",
        "};",
        "",
        "} // namespace gbastudio_dungeon_crawler_project",
        "",
    ])
    return "\n".join(output)


def emit_racing_player_animation_set(output, player, asset_report, base_dir=None, prefix="racing_player"):
    clips = player.get("animations", {})
    fixed_actions = ("idle", "drive", "steer_left", "steer_right", "brake", "hurt", "brake_left", "brake_right")
    directions = ("up", "right", "down", "left")
    actions = fixed_actions + tuple(f"{action}_{direction}" for direction in directions for action in ("idle", "drive", "hurt"))
    if not isinstance(clips, dict) or set(clips) - set(actions):
        raise SystemExit("racing_project.player.animations contem estado desconhecido")
    expressions = []
    for action in actions:
        entry = clips.get(action)
        if entry is None:
            expressions.append("nullptr")
            continue
        if not isinstance(entry, dict) or not entry.get("frame_indices"):
            raise SystemExit(f"racing animations {action} precisa de frame_indices")
        if action.startswith("hurt") and entry.get("loops", True):
            raise SystemExit("racing hurt precisa declarar loops false")
        symbol = emit_topdown_animation_frame_subset(output, prefix, action, entry, asset_report, f"racing animations {action}", base_dir)
        expressions.append(f"&{symbol}")
    directional_expressions = ", ".join("{ " + ", ".join(expressions[index:index + 3]) + " }" for index in range(len(fixed_actions), len(actions), 3))
    return f"gbs::RacingVehicleAnimationSet {{ {', '.join(expressions[:len(fixed_actions)])}, {{ {directional_expressions} }} }}"


def emit_racing_pseudo3d_visuals(output, racing_project, asset_report=None):
    visuals = racing_project.get("pseudo3d_visuals", [])
    if visuals is None:
        visuals = []
    if not isinstance(visuals, list):
        raise SystemExit("racing_project.pseudo3d_visuals precisa ser lista")
    if not visuals:
        return ("nullptr", 0)

    output.append("constexpr gbs::RacingPseudo3DVisualData racing_pseudo3d_visuals[] = {")
    for index, visual in enumerate(visuals):
        description = f"racing_project.pseudo3d_visuals[{index}]"
        if not isinstance(visual, dict):
            raise SystemExit(f"{description} precisa ser objeto")
        panorama = visual.get("panorama")
        floor = visual.get("floor")
        minimap = visual.get("minimap")
        if not isinstance(floor, (str, dict)):
            raise SystemExit(f"{description} precisa declarar floor")
        horizon = require_int(visual.get("horizon_y", 48), f"{description}.horizon_y", 1, 159)
        panorama_tiles = resolve_project_asset_symbol(panorama, "tile_assets", asset_report, f"{description}.panorama") if panorama else None
        panorama_tilemap = resolve_project_asset_symbol(panorama, "tilemap", asset_report, f"{description}.panorama") if panorama else None
        panorama_palette = resolve_project_asset_symbol(panorama, "palette_asset", asset_report, f"{description}.panorama") if panorama else None
        floor_tiles = resolve_project_asset_symbol(floor, "affine_tile_asset", asset_report, f"{description}.floor")
        floor_tilemap = resolve_project_asset_symbol(floor, "affine_tilemap_asset", asset_report, f"{description}.floor")
        floor_palette = resolve_project_asset_symbol(floor, "palette_asset", asset_report, f"{description}.floor")
        minimap_tiles = resolve_project_asset_symbol(minimap, "tile_assets", asset_report, f"{description}.minimap") if minimap else None
        minimap_tilemap = resolve_project_asset_symbol(minimap, "tilemap", asset_report, f"{description}.minimap") if minimap else None
        minimap_palette = resolve_project_asset_symbol(minimap, "palette_asset", asset_report, f"{description}.minimap") if minimap else None
        output.append(
            "    gbs::RacingPseudo3DVisualData { "
            f"{horizon}, {'&' + panorama_tiles if panorama_tiles else 'nullptr'}, {'&' + panorama_tilemap if panorama_tilemap else 'nullptr'}, {'&' + panorama_palette if panorama_palette else 'nullptr'}, "
            f"&{floor_tiles}, &{floor_tilemap}, &{floor_palette}, "
            f"{'&' + minimap_tiles if minimap_tiles else 'nullptr'}, {'&' + minimap_tilemap if minimap_tilemap else 'nullptr'}, {'&' + minimap_palette if minimap_palette else 'nullptr'} "
            "},"
        )
    output.append("};")
    output.append("")
    return ("racing_pseudo3d_visuals", len(visuals))


def emit_racing_project_data_header(racing_project, asset_report=None, base_dir=None):
    if not isinstance(racing_project, dict):
        raise SystemExit("racing_project precisa ser objeto")
    rooms = racing_project.get("rooms")
    if not isinstance(rooms, list) or not rooms:
        raise SystemExit("racing_project.rooms precisa ser lista nao vazia")

    # Bank groups also own implicit resources (hit effects, for example).
    # Their upload sources must exist even without a semantic asset reference.
    racing_asset_ids = project_referenced_asset_ids(racing_project, asset_report)
    room_groups = {
        room.get("resource_bank_group", room.get("bank_group"))
        for room in rooms if isinstance(room, dict)
    } - {None}
    for bank in (asset_report or {}).get("resource_bank_plan", []):
        if not isinstance(bank, dict):
            continue
        groups = set(bank.get("groups") or []) | {bank.get("group")}
        asset_id = bank.get("asset")
        if room_groups.intersection(groups) and isinstance(asset_id, str) and asset_id not in racing_asset_ids:
            racing_asset_ids.append(asset_id)
    headers = asset_pack_header_map(asset_report)

    output = [
        "#pragma once",
        "#include <stddef.h>",
        "#include <stdint.h>",
        "#include \"gbs/racing.hpp\"",
        "#include \"gbs/runtime_save_restore.hpp\"",
    ]
    for include in merge_includes(
        string_list_from_json(racing_project.get("includes", []), "racing_project.includes"),
        [headers[asset_id] for asset_id in racing_asset_ids if asset_id in headers],
    ):
        output.append(f"#include {cpp_string_literal(include)}")
    output.extend(["", "namespace gbastudio_racing_project {", ""])
    asset_refs = emit_project_asset_references(output, racing_project, "racing_project", "racing_project", include_audio=True, asset_report=asset_report)
    save_config = save_config_from_json(
        racing_project.get("save"),
        "racing_project.save",
        "GBUS",
        0,
    )
    emit_save_config(output, save_config)
    resource_bank_upload_sources_name, resource_bank_upload_source_count = emit_resource_bank_upload_sources(
        output, asset_report, racing_asset_ids
    )
    resource_banks_name, resource_bank_count, resource_bank_groups_name, resource_bank_group_count = emit_project_resource_banks(
        output,
        racing_project,
        "racing_project",
        asset_report,
    )
    backgrounds_name, background_count = emit_advanced_runtime_backgrounds(
        output,
        racing_project,
        "racing_project",
        "gbs::RacingBackgroundData",
        "racing_backgrounds",
        asset_report,
    )
    pseudo3d_visuals_name, pseudo3d_visual_count = emit_racing_pseudo3d_visuals(
        output,
        racing_project,
        asset_report,
    )
    dialogue_lines_name, dialogue_line_count = emit_dialogue_lines(
        output,
        racing_project.get("dialogue_lines", []),
        "racing_project.dialogue_lines",
    )
    player = racing_project.get("player", {})
    if player is None:
        player = {}
    if not isinstance(player, dict):
        raise SystemExit("racing_project.player precisa ser objeto")
    idle_metasprite = resolve_project_metasprite_symbol(player.get("idle_metasprite"), None, asset_report, "racing_project.player.idle_metasprite")
    drive_metasprite = resolve_project_metasprite_symbol(player.get("drive_metasprite"), None, asset_report, "racing_project.player.drive_metasprite")
    player_animations = emit_racing_player_animation_set(output, player, asset_report, base_dir)
    room_entries = []
    for room_index, room in enumerate(rooms):
        if not isinstance(room, dict):
            raise SystemExit(f"racing_project.rooms[{room_index}] precisa ser objeto")
        room_player = room.get("player")
        room_player_expression = "nullptr"
        if room_player is not None:
            description = f"racing_project.rooms[{room_index}].player"
            if not isinstance(room_player, dict):
                raise SystemExit(f"{description} precisa ser objeto")
            room_idle = resolve_project_metasprite_symbol(room_player.get("idle_metasprite"), None, asset_report, f"{description}.idle_metasprite")
            room_drive = resolve_project_metasprite_symbol(room_player.get("drive_metasprite"), None, asset_report, f"{description}.drive_metasprite")
            room_clips = emit_racing_player_animation_set(output, room_player, asset_report, base_dir, f"racing_room_{room_index}_player")
            visual_name = f"racing_room_{room_index}_player_visual"
            idle_expression = f"&{room_idle}" if room_idle else "nullptr"
            drive_expression = f"&{room_drive}" if room_drive else "nullptr"
            output.append(f"constexpr gbs::RacingPlayerVisual {visual_name} {{ {idle_expression}, {drive_expression}, {room_clips} }};")
            room_player_expression = f"&{visual_name}"
        width = int(room.get("width_tiles", room.get("width", 0)))
        height = int(room.get("height_tiles", room.get("height", 0)))
        if width <= 0 or height <= 1:
            raise SystemExit(f"racing_project.rooms[{room_index}] dimensoes invalidas")
        flags = int_list_from_json(
            room.get("collision_flags", []),
            width * height,
            f"racing_project.rooms[{room_index}].collision_flags",
        )
        flags_name = f"racing_room_{room_index}_collision_flags"
        output.append(f"constexpr uint8_t {flags_name}[] = {{")
        output.append("    " + ", ".join(str(max(0, min(255, int(value)))) for value in flags))
        output.append("};")
        output.append("")
        config = room.get("config", {})
        if not isinstance(config, dict):
            raise SystemExit(f"racing_project.rooms[{room_index}].config precisa ser objeto")
        presentation = config.get("presentation", "topdown")
        if presentation not in ("topdown", "pseudo3d"):
            raise SystemExit(
                f"racing_project.rooms[{room_index}].config.presentation precisa ser topdown ou pseudo3d"
            )
        presentation_expr = (
            "gbs::RacingPresentation::Pseudo3D"
            if presentation == "pseudo3d"
            else "gbs::RacingPresentation::Topdown"
        )
        laps_to_win = int(config.get("laps_to_win", 1))
        checkpoints_per_lap = int(config.get("checkpoints_per_lap", 1))
        pickups_per_lap = int(config.get("pickups_per_lap", 0))
        rival_speed = int(config.get("rival_speed_x256_per_second", 0))
        road_curve = int(config.get("road_curve", 0))
        show_minimap = "true" if config.get("show_minimap", False) is True else "false"
        player = room.get("player_start_pixels", {})
        if not isinstance(player, dict):
            raise SystemExit(f"racing_project.rooms[{room_index}].player_start_pixels precisa ser objeto")
        on_enter = emit_event_script(
            output,
            f"racing_room_{room_index}_on_enter",
            room.get("on_enter"),
            f"racing_project.rooms[{room_index}].on_enter",
        )
        on_victory = emit_event_script(
            output,
            f"racing_room_{room_index}_on_victory",
            room.get("on_victory"),
            f"racing_project.rooms[{room_index}].on_victory",
        )
        on_defeat = emit_event_script(
            output,
            f"racing_room_{room_index}_on_defeat",
            room.get("on_defeat"),
            f"racing_project.rooms[{room_index}].on_defeat",
        )
        triggers_name, trigger_count = emit_runtime_triggers(
            output,
            f"racing_room_{room_index}",
            room,
            f"racing_project.rooms[{room_index}]",
        )
        actors_name, actor_count = emit_advanced_runtime_actors(
            output,
            room,
            room_index,
            f"racing_project.rooms[{room_index}]",
            "gbs::RacingActorData",
            "racing",
            asset_report,
            pixel_positions=True,
        )
        resource_group = room.get("resource_bank_group", room.get("bank_group"))
        if resource_group is not None and (
            not isinstance(resource_group, str) or not resource_group
        ):
            raise SystemExit(
                f"racing_project.rooms[{room_index}].resource_bank_group precisa ser string nao vazia"
            )
        resource_group_expr = (
            cpp_string_literal(resource_group)
            if isinstance(resource_group, str)
            else "nullptr"
        )
        pseudo3d_visual_index = require_int(
            room.get("pseudo3d_visual", -1),
            f"racing_project.rooms[{room_index}].pseudo3d_visual",
            -1,
            pseudo3d_visual_count - 1,
        )
        pseudo3d_visual_expr = (
            f"&{pseudo3d_visuals_name}[{pseudo3d_visual_index}]"
            if pseudo3d_visual_index >= 0
            else "nullptr"
        )
        track_segments = room.get("track_segments", [])
        if track_segments is None:
            track_segments = []
        if not isinstance(track_segments, list):
            raise SystemExit(f"racing_project.rooms[{room_index}].track_segments precisa ser lista")
        track_segments_name = f"racing_room_{room_index}_track_segments"
        track_length_pixels = 0
        if track_segments:
            output.append(f"constexpr gbs::RacingTrackSegment {track_segments_name}[] = {{")
            for segment_index, segment in enumerate(track_segments):
                description = f"racing_project.rooms[{room_index}].track_segments[{segment_index}]"
                if not isinstance(segment, dict):
                    raise SystemExit(f"{description} precisa ser objeto")
                length_pixels = require_int(segment.get("length_pixels", 0), f"{description}.length_pixels", 1, 4096)
                curve = require_int(segment.get("curve", 0), f"{description}.curve", -64, 64)
                half_width = require_int(segment.get("half_width", 0), f"{description}.half_width", 1, 128)
                track_length_pixels += length_pixels
                output.append(f"    gbs::RacingTrackSegment {{ {length_pixels}, {curve}, {half_width} }},")
            if track_length_pixels != height * 8:
                raise SystemExit(
                    f"racing_project.rooms[{room_index}].track_segments precisa somar {height * 8} pixels"
                )
            output.append("};")
            output.append("")
            track_segments_expr = track_segments_name
            track_segment_count = len(track_segments)
        else:
            track_segments_expr = "nullptr"
            track_segment_count = 0
        topdown_track = room.get("topdown_track")
        topdown_track_expr = "nullptr"
        if topdown_track is not None:
            if not isinstance(topdown_track, dict):
                raise SystemExit(f"racing_project.rooms[{room_index}].topdown_track precisa ser objeto")
            camera_dead_zone = topdown_track.get("camera_dead_zone", {})
            if not isinstance(camera_dead_zone, dict):
                raise SystemExit(
                    f"racing_project.rooms[{room_index}].topdown_track.camera_dead_zone precisa ser objeto"
                )
            camera_x = require_int(
                camera_dead_zone.get("x", 0),
                f"racing_project.rooms[{room_index}].topdown_track.camera_dead_zone.x",
                0,
                120,
            )
            camera_y = require_int(
                camera_dead_zone.get("y", 0),
                f"racing_project.rooms[{room_index}].topdown_track.camera_dead_zone.y",
                0,
                80,
            )
            start_heading = require_int(
                topdown_track.get("start_heading", 0),
                f"racing_project.rooms[{room_index}].topdown_track.start_heading",
                0,
                15,
            )
            path_points = topdown_track.get("path_points", [])
            if not isinstance(path_points, list) or (path_points and not 2 <= len(path_points) <= 32):
                raise SystemExit(f"racing_project.rooms[{room_index}].topdown_track.path_points precisa ter 2 a 32 pontos")
            path_name = f"racing_room_{room_index}_topdown_path"
            path_entries = []
            for point_index, point in enumerate(path_points):
                description = f"racing_project.rooms[{room_index}].topdown_track.path_points[{point_index}]"
                if not isinstance(point, dict):
                    raise SystemExit(f"{description} precisa ser objeto")
                point_x = require_int(point.get("x"), f"{description}.x", 0, width * 8 - 1)
                point_y = require_int(point.get("y"), f"{description}.y", 0, height * 8 - 1)
                path_entries.append(f"    gbs::Vec2i {{ {point_x}, {point_y} }},")
            if path_entries:
                output.append(f"constexpr gbs::Vec2i {path_name}[] = {{")
                output.extend(path_entries)
                output.append("};")
            checkpoints = topdown_track.get("checkpoints", [])
            if not isinstance(checkpoints, list):
                raise SystemExit(f"racing_project.rooms[{room_index}].topdown_track.checkpoints precisa ser lista")
            if len(checkpoints) > 16:
                raise SystemExit(f"racing_project.rooms[{room_index}].topdown_track aceita no maximo 16 checkpoints")
            checkpoint_name = f"racing_room_{room_index}_topdown_checkpoints"
            checkpoint_entries = []
            checkpoint_ids = set()
            for checkpoint_index, checkpoint in enumerate(checkpoints):
                description = (
                    f"racing_project.rooms[{room_index}].topdown_track.checkpoints[{checkpoint_index}]"
                )
                if not isinstance(checkpoint, dict):
                    raise SystemExit(f"{description} precisa ser objeto")
                checkpoint_id = checkpoint.get("id", "")
                if not isinstance(checkpoint_id, str) or not checkpoint_id.strip():
                    raise SystemExit(f"{description}.id precisa ser string nao vazia")
                checkpoint_id = checkpoint_id.strip()
                if checkpoint_id in checkpoint_ids:
                    raise SystemExit(f"{description}.id precisa ser unico")
                checkpoint_ids.add(checkpoint_id)
                checkpoint_x = require_int(checkpoint.get("x", 0), f"{description}.x", 0, 4095)
                checkpoint_y = require_int(checkpoint.get("y", 0), f"{description}.y", 0, 4095)
                checkpoint_width = require_int(checkpoint.get("width", 0), f"{description}.width", 1, 256)
                checkpoint_height = require_int(checkpoint.get("height", 0), f"{description}.height", 1, 256)
                if checkpoint_x >= width * 8 or checkpoint_y >= height * 8:
                    raise SystemExit(f"{description} precisa estar dentro das dimensoes da sala")
                checkpoint_entries.append(
                    f"    gbs::RacingTopdownCheckpoint {{ {cpp_string_literal(checkpoint_id)}, "
                    f"{{ {checkpoint_x}, {checkpoint_y} }}, {checkpoint_width}, {checkpoint_height} }},"
                )
            if checkpoint_entries:
                output.append(f"constexpr gbs::RacingTopdownCheckpoint {checkpoint_name}[] = {{")
                output.extend(checkpoint_entries)
                output.append("};")
                output.append(
                    f"constexpr gbs::RacingTopdownTrackData racing_room_{room_index}_topdown_track "
                    f"{{ {camera_x}, {camera_y}, {checkpoint_name}, {len(checkpoint_entries)}, {start_heading}, "
                    f"{path_name if path_entries else 'nullptr'}, {len(path_entries)}{', true' if topdown_track.get('finish_at_zero', False) else ''} }};"
                )
                output.append("")
                topdown_track_expr = f"&racing_room_{room_index}_topdown_track"
        room_video_literal = room_video_composition_literal(
            room,
            f"racing_project.rooms[{room_index}]",
            asset_report,
        )
        camera = room.get("perspective_camera", {})
        camera_height = require_int(camera.get("height", 48), "racing.perspective_camera.height", 16, 96)
        camera_distance = require_int(camera.get("distance", 64), "racing.perspective_camera.distance", 32, 160)
        camera_focal = require_int(camera.get("focal_length", 96), "racing.perspective_camera.focal_length", 48, 160)
        floor_expression = "nullptr"
        empty_floor_expression = "-1"
        if "floor_tilemap" in room:
            if width != height or width not in (16, 32, 64, 128):
                raise SystemExit("Circuito affine precisa ser quadrado com 16, 32, 64 ou 128 tiles por lado")
            floor_values = room["floor_tilemap"]
            if not isinstance(floor_values, list) or len(floor_values) != width * height:
                raise SystemExit("floor_tilemap precisa ter uma entrada por celula do circuito")
            visual_index = room.get("pseudo3d_visual")
            visuals = racing_project.get("pseudo3d_visuals", [])
            if not isinstance(visual_index, int) or not 0 <= visual_index < len(visuals):
                raise SystemExit("Circuito em perspectiva precisa de um piso affine")
            floor_ref = resolve_project_asset_symbol(visuals[visual_index]["floor"], "affine_tilemap_asset", asset_report, "racing.floor")
            floor_name = f"racing_room_{room_index}_floor"
            indices = [require_int(value, "floor_tilemap tile", -1, 16383) for value in floor_values]
            used_indices = [value for value in indices if value >= 0]
            if used_indices:
                output.append(f'static_assert({max(used_indices)} < {floor_ref}.width * {floor_ref}.height, "Tile do piso fora do atlas selecionado");')
            if -1 in indices:
                source = floor_ref[:-len("_tilemap_asset")]
                empty_floor_expression = f"{floor_name}_empty_tile"
                output.extend([
                    f"constexpr int {floor_name}_find_empty_tile() {{",
                    f"    for(int tile=0;tile<{source}_tile_count;++tile) {{",
                    "        bool empty=true;",
                    f"        for(int pixel=0;pixel<64;++pixel) if({source}_tiles[tile][pixel]!=0) {{ empty=false; break; }}",
                    f"        if(empty) return {floor_ref}.entries[0]+tile;",
                    "    }",
                    f"    return {floor_ref}.entries[0]+{source}_tile_count<256 ? {floor_ref}.entries[0]+{source}_tile_count : -1;",
                    "}",
                    f"constexpr int {empty_floor_expression}={floor_name}_find_empty_tile();",
                    f'static_assert({empty_floor_expression}>=0, "Piso sem espaco para tile apagado; use ate 255 tiles unicos ou um tile transparente");'
                ])
            output.append(f"constexpr uint8_t {floor_name}_entries[] = {{")
            output.append("    " + ", ".join((empty_floor_expression if value < 0 else f"{floor_ref}.entries[{value}]") for value in indices))
            output.append("};")
            output.append(f"constexpr gbs::AffineTileMapAsset {floor_name} {{ {floor_name}_entries, {width}, {height} }};")
            floor_expression = f"&{floor_name}"
        room_entries.append(
            "    gbs::RacingRoomData { "
            f"{cpp_string_literal(room.get('name', f'room_{room_index}'))}, "
            f"{flags_name}, {width}, {height}, "
            "gbs::RacingConfig { "
            f"{int(config.get('max_speed_x256', 1024))}, "
            f"{int(config.get('acceleration_x256_per_second', 2048))}, "
            f"{int(config.get('brake_power_x256_per_second', 3072))}, "
            f"{int(config.get('steering_speed_x256', 512))}, "
            "gbs::RacingPseudo3DConfig { "
            f"{presentation_expr}, {laps_to_win}, {checkpoints_per_lap}, "
            f"{pickups_per_lap}, {rival_speed}, {road_curve}, {show_minimap} "
            "} "
            "}, "
            f"gbs::Vec2i {{ {int(player.get('x', 32))}, {int(player.get('y', 80))} }}, "
            f"{int(room.get('background', room.get('background_index', -1)))}, "
            f"{on_enter}, {triggers_name}, {trigger_count}, {actors_name}, {actor_count}, "
            f"{resource_group_expr}, {on_victory}, {on_defeat}, {pseudo3d_visual_expr}, "
            f"{track_segments_expr}, {track_segment_count}, {topdown_track_expr}, "
            f"{room_video_literal}, gbs::RacingCameraConfig {{ {camera_height}, {camera_distance}, {camera_focal} }}, {floor_expression}, {empty_floor_expression}, {room_player_expression} "
            "},"
        )

    output.append("constexpr gbs::RacingRoomData rooms[] = {")
    output.extend(room_entries)
    output.append("};")
    output.append("")
    output.extend([
        "constexpr gbs::RacingProjectData project {",
        "    rooms,",
        f"    {len(rooms)},",
        f"    {int(racing_project.get('initial_room', 0))},",
        f"    {asset_refs['bg_palettes'][0]},",
        f"    {asset_refs['bg_palettes'][1]},",
        f"    {asset_refs['obj_palettes'][0]},",
        f"    {asset_refs['obj_palettes'][1]},",
        f"    {asset_refs['tile_assets'][0]},",
        f"    {asset_refs['tile_assets'][1]},",
        f"    {backgrounds_name},",
        f"    {background_count},",
        f"    {'&' + idle_metasprite if idle_metasprite else 'nullptr'},",
        f"    {'&' + drive_metasprite if drive_metasprite else 'nullptr'},",
        f"    {dialogue_lines_name},",
        f"    {dialogue_line_count},",
        f"    {asset_refs['sfx_assets'][0]},",
        f"    {asset_refs['sfx_assets'][1]},",
        f"    {asset_refs['music_assets'][0]},",
        f"    {asset_refs['music_assets'][1]},",
        f"    {asset_refs['tracker_assets'][0]},",
        f"    {asset_refs['tracker_assets'][1]},",
        f"    {asset_refs['pcm_assets'][0]},",
        f"    {asset_refs['pcm_assets'][1]},",
        f"    {resource_banks_name},",
        f"    {resource_bank_count},",
        f"    {resource_bank_groups_name},",
        f"    {resource_bank_group_count},",
        f"    {player_animations},",
        f"    {resource_bank_upload_sources_name},",
        f"    {resource_bank_upload_source_count}",
        "};",
        "",
        "} // namespace gbastudio_racing_project",
        "",
    ])
    return "\n".join(output)


def emit_battle_rpg_backgrounds(output, battle_project, asset_report=None):
    backgrounds = battle_project.get("backgrounds", [])
    if backgrounds is None:
        backgrounds = []
    if not isinstance(backgrounds, list):
        raise SystemExit("battle_rpg_project.backgrounds precisa ser lista")
    if not backgrounds:
        return ("nullptr", 0)

    output.append("constexpr gbs::BattleRpgBackgroundData battle_rpg_backgrounds[] = {")
    for index, background in enumerate(backgrounds):
        if not isinstance(background, dict):
            raise SystemExit(f"battle_rpg_project.backgrounds[{index}] precisa ser objeto")
        tilemap = background.get("tilemap", background.get("tilemap_asset"))
        if not isinstance(tilemap, str) or not tilemap:
            raise SystemExit(f"battle_rpg_project.backgrounds[{index}].tilemap precisa ser string")
        tilemap_symbol = resolve_project_asset_symbol(
            tilemap,
            "tilemap",
            asset_report,
            f"battle_rpg_project.backgrounds[{index}].tilemap",
        )
        layer = background_layer_from_json(background.get("layer", "bg2"))
        output.append(
            "    gbs::BattleRpgBackgroundData { "
            f"{cpp_string_literal(background.get('name', f'background_{index}'))}, "
            f"gbs::BackgroundLayer::{layer}, "
            f"{tilemap_symbol}, "
            f"static_cast<uint16_t>({int(background.get('backdrop_color', 0))}) "
            "},"
        )
    output.extend(["};", ""])
    return ("battle_rpg_backgrounds", len(backgrounds))


def emit_battle_rpg_project_data_header(battle_project, asset_report=None):
    if not isinstance(battle_project, dict):
        raise SystemExit("battle_rpg_project precisa ser objeto")
    encounters = battle_project.get("encounters")
    if not isinstance(encounters, list) or not encounters:
        raise SystemExit("battle_rpg_project.encounters precisa ser lista nao vazia")
    includes = merge_includes(
        string_list_from_json(battle_project.get("includes", []), "battle_rpg_project.includes"),
        project_auto_includes(battle_project, asset_report),
    )
    output = ["#pragma once", "#include \"gbs/battle_rpg.hpp\"", "#include \"gbs/runtime_save_restore.hpp\""]
    for include in includes:
        output.append(f'#include "{include}"')
    output.extend(["", "namespace gbastudio_battle_rpg_project {", ""])
    asset_refs = emit_project_asset_references(
        output,
        battle_project,
        "battle_rpg_project",
        "project",
        include_audio=True,
        asset_report=asset_report,
    )
    save_config = save_config_from_json(battle_project.get("save"), "battle_rpg_project.save", "GBBR", 1024)
    emit_save_config(output, save_config)
    output.extend([
        f"constexpr bool save_autosave = {'true' if save_config['autosave'] else 'false'};",
        "",
    ])
    backgrounds_name, background_count = emit_battle_rpg_backgrounds(output, battle_project, asset_report)
    resource_banks_name, resource_bank_count, resource_bank_groups_name, resource_bank_group_count = emit_project_resource_banks(
        output,
        battle_project,
        "battle_rpg_project",
        asset_report,
    )
    emit_resource_bank_upload_sources(output, asset_report)
    dialogue_lines_name, dialogue_line_count = emit_dialogue_lines(
        output,
        battle_project.get("dialogue_lines", []),
        "battle_rpg_project.dialogue_lines",
    )
    project_script_entries = []
    project_scripts = battle_project.get("scripts", battle_project.get("event_scripts", []))
    if project_scripts is None:
        project_scripts = []
    if not isinstance(project_scripts, list):
        raise SystemExit("battle_rpg_project.scripts precisa ser lista")
    for script_index, script in enumerate(project_scripts):
        commands = script.get("script", script.get("commands", [])) if isinstance(script, dict) else script
        project_script_entries.append(emit_event_script(
            output,
            f"battle_rpg_project_script_{script_index}",
            commands,
            f"battle_rpg_project.scripts[{script_index}]",
        ))
    project_scripts_name = "nullptr"
    project_script_count = 0
    if project_script_entries:
        project_scripts_name = "battle_rpg_project_scripts"
        project_script_count = len(project_script_entries)
        output.append(f"constexpr gbs::EventScript {project_scripts_name}[] = {{")
        for script in project_script_entries:
            output.append(f"    {script},")
        output.extend(["};", ""])
    entries = []
    for index, encounter in enumerate(encounters):
        if not isinstance(encounter, dict):
            raise SystemExit(f"battle_rpg_project.encounters[{index}] precisa ser objeto")
        config = encounter.get("config", {})
        party = encounter.get("party", [])
        enemies = encounter.get("enemies", [])
        rewards = encounter.get("rewards", {})
        if not isinstance(config, dict) or not isinstance(rewards, dict) or not isinstance(party, list) or not isinstance(enemies, list) or not party or not enemies:
            raise SystemExit(f"battle_rpg_project.encounters[{index}] config/party/enemies/rewards invalidos")

        participant_arrays = {}
        for side, participants in (("party", party), ("enemies", enemies)):
            participant_entries = []
            for participant_index, participant in enumerate(participants):
                if not isinstance(participant, dict) or not isinstance(participant.get("unit"), dict):
                    raise SystemExit(f"battle_rpg_project.encounters[{index}].{side}[{participant_index}] invalido")
                abilities = participant.get("abilities", [])
                if not isinstance(abilities, list) or not abilities:
                    raise SystemExit(f"battle_rpg_project.encounters[{index}].{side}[{participant_index}].abilities precisa ser lista nao vazia")
                abilities_name = f"encounter_{index}_{side}_{participant_index}_abilities"
                output.append(f"constexpr gbs::BattleRpgAbilityData {abilities_name}[] = {{")
                ability_kinds = {"attack": "Attack", "magic": "Magic", "heal": "Heal", "defend": "Defend"}
                for ability_index, ability in enumerate(abilities):
                    if not isinstance(ability, dict) or ability.get("kind") not in ability_kinds:
                        raise SystemExit(f"battle_rpg_project.encounters[{index}].{side}[{participant_index}].abilities[{ability_index}] invalida")
                    output.append(
                        "    gbs::BattleRpgAbilityData { "
                        f"gbs::BattleRpgAbilityKind::{ability_kinds[ability['kind']]}, {int(ability.get('power', 0))} "
                        "},"
                    )
                output.extend(["};", ""])
                unit = participant["unit"]
                metasprite = resolve_project_metasprite_symbol(
                    participant.get("metasprite"),
                    None,
                    asset_report,
                    f"battle_rpg_project.encounters[{index}].{side}[{participant_index}].metasprite",
                )
                participant_entries.append(
                    "    gbs::BattleRpgParticipantData { "
                    f"{cpp_string_literal(participant.get('name', f'{side}_{participant_index}'))}, "
                    f"gbs::BattleRpgUnitData {{ {int(unit.get('max_hp', 24))}, {int(unit.get('attack', 7))}, {int(unit.get('defense', 2))}, {int(unit.get('speed', 5))} }}, "
                    f"{abilities_name}, {len(abilities)}, "
                    f"{'&' + metasprite if metasprite else 'nullptr'}, "
                    f"{max(1, min(2, int(participant.get('sprite_scale', 1))))} "
                    "},"
                )
            participants_name = f"encounter_{index}_{side}"
            output.append(f"constexpr gbs::BattleRpgParticipantData {participants_name}[] = {{")
            output.extend(participant_entries)
            output.extend(["};", ""])
            participant_arrays[side] = participants_name
        on_enter = emit_event_script(
            output,
            f"encounter_{index}_on_enter",
            encounter.get("on_enter"),
            f"battle_rpg_project.encounters[{index}].on_enter",
        )
        on_victory = emit_event_script(
            output,
            f"encounter_{index}_on_victory",
            encounter.get("on_victory"),
            f"battle_rpg_project.encounters[{index}].on_victory",
        )
        on_defeat = emit_event_script(
            output,
            f"encounter_{index}_on_defeat",
            encounter.get("on_defeat"),
            f"battle_rpg_project.encounters[{index}].on_defeat",
        )
        on_escape = emit_event_script(
            output,
            f"encounter_{index}_on_escape",
            encounter.get("on_escape"),
            f"battle_rpg_project.encounters[{index}].on_escape",
        )
        resource_group = encounter.get("resource_bank_group", encounter.get("bank_group"))
        resource_group_expr = cpp_string_literal(resource_group) if isinstance(resource_group, str) and resource_group else "nullptr"
        entries.append(
            "    gbs::BattleRpgEncounterData { "
            f"{cpp_string_literal(encounter.get('name', f'encounter_{index}'))}, "
            "gbs::BattleRpgConfig { "
            f"{int(config.get('max_party_size', 4))}, {int(config.get('max_enemies', 4))}, "
            f"{int(config.get('turn_delay_frames', 20))}, "
            f"{'true' if bool(config.get('active_time_battle', False)) else 'false'}, "
            f"{'true' if bool(config.get('escape_enabled', True)) else 'false'} }}, "
            f"{participant_arrays['party']}, {len(party)}, {participant_arrays['enemies']}, {len(enemies)}, "
            f"gbs::BattleRpgRewards {{ {int(rewards.get('gold', 25))}, {int(rewards.get('experience', 10))} }}, "
            f"{on_enter}, {on_victory}, {on_defeat}, {on_escape}, "
            f"{int(encounter.get('background', encounter.get('background_index', -1)))}, "
            f"{resource_group_expr} "
            "},"
        )
    output.append("constexpr gbs::BattleRpgEncounterData encounters[] = {")
    output.extend(entries)
    output.extend([
        "};",
        "",
        "constexpr gbs::BattleRpgProjectData project {",
        "    encounters,",
        f"    {len(encounters)},",
        f"    {int(battle_project.get('initial_encounter', 0))},",
        f"    {dialogue_lines_name},",
        f"    {dialogue_line_count},",
        f"    {asset_refs['sfx_assets'][0]},",
        f"    {asset_refs['sfx_assets'][1]},",
        f"    {asset_refs['music_assets'][0]},",
        f"    {asset_refs['music_assets'][1]},",
        f"    {asset_refs['pcm_assets'][0]},",
        f"    {asset_refs['pcm_assets'][1]},",
        f"    {asset_refs['tracker_assets'][0]},",
        f"    {asset_refs['tracker_assets'][1]},",
        f"    {project_scripts_name},",
        f"    {project_script_count},",
        f"    {asset_refs['bg_palettes'][0]},",
        f"    {asset_refs['bg_palettes'][1]},",
        f"    {asset_refs['obj_palettes'][0]},",
        f"    {asset_refs['obj_palettes'][1]},",
        f"    {asset_refs['tile_assets'][0]},",
        f"    {asset_refs['tile_assets'][1]},",
        f"    {backgrounds_name},",
        f"    {background_count},",
        f"    {resource_banks_name},",
        f"    {resource_bank_count},",
        f"    {resource_bank_groups_name},",
        f"    {resource_bank_group_count}",
        "};",
        "",
        "} // namespace gbastudio_battle_rpg_project",
        "",
    ])
    return "\n".join(output)


def luta_ism_style_from_json(value, description):
    normalized = str(value or "a-ism").strip().lower().replace("_", "-")
    styles = {
        "a-ism": "gbs::LutaIsmStyle::AIsm",
        "aism": "gbs::LutaIsmStyle::AIsm",
        "x-ism": "gbs::LutaIsmStyle::XIsm",
        "xism": "gbs::LutaIsmStyle::XIsm",
        "v-ism": "gbs::LutaIsmStyle::VIsm",
        "vism": "gbs::LutaIsmStyle::VIsm",
    }
    if normalized not in styles:
        raise SystemExit(f"{description} precisa ser a-ism, x-ism ou v-ism")
    return styles[normalized]


LUTA_VISUAL_ANIMATION_STATES = ("idle", "attack", "special", "guard", "hurt")


def emit_luta_animation_set(output, prefix, fighter, asset_report, description, base_dir=None):
    raw_set = fighter.get("animation_set")
    if raw_set is None:
        return "nullptr"
    if not isinstance(raw_set, dict):
        raise SystemExit(f"{description}.animation_set precisa ser objeto")

    fallback = raw_set.get("fallback", "static_metasprite")
    if fallback not in ("static_metasprite", "idle_animation"):
        raise SystemExit(
            f"{description}.animation_set.fallback precisa ser static_metasprite ou idle_animation"
        )

    symbols = {}
    for state in LUTA_VISUAL_ANIMATION_STATES:
        entry = raw_set.get(state)
        if entry is None:
            continue
        entry_description = f"{description}.animation_set.{state}"
        if not isinstance(entry, dict):
            raise SystemExit(f"{entry_description} precisa ser objeto")
        if entry.get("frame_indices", entry.get("frames")) is None:
            raise SystemExit(f"{entry_description} precisa declarar frame_indices")
        symbols[state] = emit_topdown_animation_frame_subset(
            output,
            prefix,
            state,
            entry,
            asset_report,
            entry_description,
            base_dir,
        )

    if fallback == "idle_animation" and "idle" not in symbols:
        raise SystemExit(
            f"{description}.animation_set.fallback idle_animation exige animation_set.idle"
        )

    set_symbol = f"{prefix}_animation_set"
    output.append(f"constexpr gbs::LutaAnimationSet {set_symbol} {{")
    for state in LUTA_VISUAL_ANIMATION_STATES:
        symbol = symbols.get(state)
        output.append(f"    {'&' + symbol if symbol else 'nullptr'},")
    output.append("};")
    output.append("")
    return f"&{set_symbol}"


def emit_luta_fighter_array(output, stage_index, side, fighters, max_super_gauge, asset_report=None, base_dir=None):
    if not isinstance(fighters, list) or not fighters:
        raise SystemExit(f"luta_project.stages[{stage_index}].{side} precisa ser lista nao vazia")

    fighter_entries = []
    for fighter_index, fighter in enumerate(fighters):
        fighter_path = f"luta_project.stages[{stage_index}].{side}[{fighter_index}]"
        if not isinstance(fighter, dict):
            raise SystemExit(f"{fighter_path} precisa ser objeto")
        unit = fighter.get("unit", {})
        combo_stats = fighter.get("combo_stats", fighter.get("comboStats", {}))
        if not isinstance(unit, dict) or not isinstance(combo_stats, dict):
            raise SystemExit(f"{fighter_path}.unit e combo_stats precisam ser objetos")

        raw_special_moves = fighter.get("special_moves", fighter.get("specialMoves", []))
        if raw_special_moves is None:
            raw_special_moves = []
        if not isinstance(raw_special_moves, list):
            raise SystemExit(f"{fighter_path}.special_moves precisa ser lista")
        special_moves_name = "nullptr"
        if raw_special_moves:
            special_move_entries = []
            for move_index, move in enumerate(raw_special_moves):
                move_path = f"{fighter_path}.special_moves[{move_index}]"
                if not isinstance(move, dict):
                    raise SystemExit(f"{move_path} precisa ser objeto")
                raw_buttons = move.get("button_sequence", move.get("buttonSequence", []))
                if not isinstance(raw_buttons, list):
                    raise SystemExit(f"{move_path}.button_sequence precisa ser lista")
                button_values = []
                for button_index, button in enumerate(raw_buttons):
                    button_name = str(button).strip().lower()
                    if button_name not in ("punch", "kick"):
                        raise SystemExit(f"{move_path}.button_sequence[{button_index}] precisa ser punch ou kick")
                    button_values.append("0" if button_name == "punch" else "1")
                buttons_name = "nullptr"
                if button_values:
                    buttons_name = f"luta_stage_{stage_index}_{side}_{fighter_index}_move_{move_index}_buttons"
                    output.append(f"constexpr uint8_t {buttons_name}[] = {{ {', '.join(button_values)} }};")
                strength = str(move.get("strength", "light")).strip().lower()
                strength_values = {"light": 0, "medium": 1, "heavy": 2}
                if strength not in strength_values:
                    raise SystemExit(f"{move_path}.strength precisa ser light, medium ou heavy")
                special_move_entries.append(
                    "    gbs::LutaSpecialMove { "
                    f"{cpp_string_literal(move.get('id', f'move_{move_index}'))}, "
                    f"{cpp_string_literal(move.get('name', f'Move {move_index + 1}'))}, "
                    f"{cpp_string_literal(move.get('input', ''))}, "
                    f"{buttons_name}, {len(button_values)}, {strength_values[strength]}, "
                    f"{max(0, min(255, int(move.get('super_level', move.get('superLevel', 0)))))}u, "
                    f"{max(0, min(65535, int(move.get('startup_frames', move.get('startupFrames', 0)))))}u, "
                    f"{max(0, min(65535, int(move.get('active_frames', move.get('activeFrames', 0)))))}u, "
                    f"{max(0, min(65535, int(move.get('recovery_frames', move.get('recoveryFrames', 0)))))}u, "
                    f"{max(-32768, min(32767, int(move.get('damage', 0))) )}, "
                    f"{max(-32768, min(32767, int(move.get('stun', 0))) )}, "
                    f"{cpp_optional_string_literal(move.get('description'))} "
                    "},"
                )
            special_moves_name = f"luta_stage_{stage_index}_{side}_{fighter_index}_special_moves"
            output.append(f"constexpr gbs::LutaSpecialMove {special_moves_name}[] = {{")
            output.extend(special_move_entries)
            output.extend(["};", ""])

        name = str(fighter.get("name", f"{side}_{fighter_index}"))
        fighter_id = str(fighter.get("id", name))
        metasprite = resolve_project_metasprite_symbol(
            fighter.get("metasprite"),
            None,
            asset_report,
            f"{fighter_path}.metasprite",
        )
        animation_set = emit_luta_animation_set(
            output,
            f"luta_stage_{stage_index}_{side}_{fighter_index}",
            fighter,
            asset_report,
            fighter_path,
            base_dir,
        )
        speed = max(1, min(65535, int(unit.get("speed", 10))))
        fighter_entries.append(
            "    gbs::LutaCharacter { "
            f"{cpp_string_literal(fighter_id)}, {cpp_string_literal(name)}, "
            f"{cpp_optional_string_literal(fighter.get('portrait_front', fighter.get('portraitFront')))}, "
            f"{cpp_optional_string_literal(fighter.get('portrait_back', fighter.get('portraitBack')))}, "
            f"{cpp_optional_string_literal(fighter.get('sprite_front', fighter.get('spriteFront')))}, "
            f"{cpp_optional_string_literal(fighter.get('sprite_back', fighter.get('spriteBack')))}, "
            f"{max(1, min(65535, int(unit.get('max_hp', 100))))}u, "
            f"{max(0, min(65535, int(unit.get('attack', 12))))}u, "
            f"{max(0, min(65535, int(unit.get('defense', 8))))}u, "
            f"{max(1, min(65535, int(fighter.get('walk_speed', fighter.get('walkSpeed', speed)))))}u, "
            f"{max(1, min(65535, int(fighter.get('jump_speed', fighter.get('jumpSpeed', speed)))))}u, "
            f"{max(1, min(65535, int(unit.get('weight', 70))))}u, "
            f"{max(0, min(65535, int(combo_stats.get('guard_power', combo_stats.get('guardPower', 48)))))}u, "
            f"{max(1, min(65535, int(fighter.get('super_gauge_max', fighter.get('superGaugeMax', max_super_gauge)))))}u, "
            f"{special_moves_name}, {len(raw_special_moves)}, "
            f"{max(0, min(65535, int(combo_stats.get('throw_range', combo_stats.get('throwRange', 16)))))}u, "
            f"{cpp_optional_string_literal(fighter.get('description'))}, "
            f"{'&' + metasprite if metasprite else 'nullptr'}, {animation_set} "
            "},"
        )

    array_name = f"luta_stage_{stage_index}_{side}_fighters"
    output.append(f"constexpr gbs::LutaCharacter {array_name}[] = {{")
    output.extend(fighter_entries)
    output.extend(["};", ""])
    return array_name, len(fighter_entries)


def emit_luta_backgrounds(output, luta_project, asset_report=None):
    backgrounds = luta_project.get("backgrounds", [])
    if backgrounds is None:
        backgrounds = []
    if not isinstance(backgrounds, list):
        raise SystemExit("luta_project.backgrounds precisa ser lista")
    if not backgrounds:
        return "nullptr", 0

    output.append("constexpr gbs::LutaBackgroundData luta_backgrounds[] = {")
    for index, background in enumerate(backgrounds):
        description = f"luta_project.backgrounds[{index}]"
        if not isinstance(background, dict):
            raise SystemExit(f"{description} precisa ser objeto")
        tilemap = background.get("tilemap", background.get("tilemap_asset"))
        if not isinstance(tilemap, str) or not tilemap:
            raise SystemExit(f"{description}.tilemap precisa ser string")
        tilemap_symbol = resolve_project_asset_symbol(tilemap, "tilemap", asset_report, f"{description}.tilemap")
        if bool(background.get("backdrop_from_tilemap_palette", False)):
            palette_symbol = resolve_project_asset_symbol(tilemap, "palette_asset", asset_report, f"{description}.tilemap")
            backdrop_color = f"{palette_symbol}.colors[0]"
        else:
            backdrop_color = str(int(background.get("backdrop_color", 0)))
        layer = background_layer_from_json(background.get("layer", "bg2"))
        output.append(
            "    gbs::LutaBackgroundData { "
            f"static_cast<uint16_t>({backdrop_color}), gbs::BackgroundLayer::{layer}, {tilemap_symbol} "
            "},"
        )
    output.extend(["};", ""])
    return "luta_backgrounds", len(backgrounds)


def emit_luta_hud(output, luta_project, asset_report=None):
    hud = luta_project.get("hud")
    if hud is None:
        return "nullptr"
    if not isinstance(hud, dict):
        raise SystemExit("luta_project.hud precisa ser objeto")
    tilemap = hud.get("tilemap", hud.get("tilemap_asset"))
    if not isinstance(tilemap, str) or not tilemap:
        raise SystemExit("luta_project.hud.tilemap precisa ser string")
    tilemap_symbol = resolve_project_asset_symbol(tilemap, "tilemap", asset_report, "luta_project.hud.tilemap")
    if bool(hud.get("backdrop_from_tilemap_palette", False)):
        palette_symbol = resolve_project_asset_symbol(tilemap, "palette_asset", asset_report, "luta_project.hud.tilemap")
        backdrop_color = f"{palette_symbol}.colors[0]"
    else:
        backdrop_color = str(int(hud.get("backdrop_color", 0)))
    layer = background_layer_from_json(hud.get("layer", "bg0"))
    output.extend([
        "constexpr gbs::LutaBackgroundData luta_hud[] = {",
        "    gbs::LutaBackgroundData { "
        f"static_cast<uint16_t>({backdrop_color}), gbs::BackgroundLayer::{layer}, {tilemap_symbol} "
        "},",
        "};",
        "",
    ])
    return "&luta_hud[0]"


def emit_luta_dialogue_lines(output, raw_lines):
    return emit_dialogue_lines(output, raw_lines, "luta_project.dialogue_lines")


def emit_luta_project_data_header(luta_project, asset_report=None, base_dir=None):
    if not isinstance(luta_project, dict):
        raise SystemExit("luta_project precisa ser objeto")
    stages = luta_project.get("stages")
    if not isinstance(stages, list) or not stages:
        raise SystemExit("luta_project.stages precisa ser lista nao vazia")

    includes = merge_includes(
        string_list_from_json(luta_project.get("includes", []), "luta_project.includes"),
        project_auto_includes(luta_project, asset_report),
    )
    output = ["#pragma once", "#include \"gbs/luta.hpp\"", "#include \"gbs/runtime_save_restore.hpp\""]
    for include in includes:
        output.append(f'#include "{include}"')
    output.extend(["", "namespace gbastudio_luta_project {", ""])

    asset_refs = emit_project_asset_references(
        output,
        luta_project,
        "luta_project",
        "luta_project",
        include_audio=True,
        asset_report=asset_report,
    )
    save_config = save_config_from_json(luta_project.get("save"), "luta_project.save", "GBLT", 0)
    emit_save_config(output, save_config)
    output.extend([f"constexpr bool save_autosave = {'true' if save_config['autosave'] else 'false'};", ""])
    resource_banks_name, resource_bank_count, resource_bank_groups_name, resource_bank_group_count = emit_project_resource_banks(
        output,
        luta_project,
        "luta_project",
        asset_report,
    )
    resource_bank_upload_sources_name, resource_bank_upload_source_count = emit_resource_bank_upload_sources(output, asset_report)
    dialogue_lines_name, dialogue_line_count = emit_luta_dialogue_lines(
        output,
        luta_project.get("dialogue_lines", []),
    )
    backgrounds_name, background_count = emit_luta_backgrounds(output, luta_project, asset_report)
    hud_name = emit_luta_hud(output, luta_project, asset_report)

    stage_entries = []
    for stage_index, stage in enumerate(stages):
        stage_path = f"luta_project.stages[{stage_index}]"
        if not isinstance(stage, dict):
            raise SystemExit(f"{stage_path} precisa ser objeto")
        config = stage.get("config", {})
        if not isinstance(config, dict):
            raise SystemExit(f"{stage_path}.config precisa ser objeto")
        max_super_gauge = max(1, min(65535, int(config.get("max_super_gauge", 100))))
        player1 = stage.get("player1", [])
        player2 = stage.get("player2", [])
        player1_name, player1_count = emit_luta_fighter_array(output, stage_index, "player1", player1, max_super_gauge, asset_report, base_dir)
        player2_name, player2_count = emit_luta_fighter_array(output, stage_index, "player2", player2, max_super_gauge, asset_report, base_dir)
        characters_name, character_count = emit_luta_fighter_array(
            output,
            stage_index,
            "characters",
            list(player1) + list(player2),
            max_super_gauge,
            asset_report,
            base_dir,
        )
        on_enter = emit_event_script(output, f"luta_stage_{stage_index}_on_enter", stage.get("on_enter"), f"{stage_path}.on_enter")
        on_victory = emit_event_script(output, f"luta_stage_{stage_index}_on_victory", stage.get("on_victory"), f"{stage_path}.on_victory")
        on_defeat = emit_event_script(output, f"luta_stage_{stage_index}_on_defeat", stage.get("on_defeat"), f"{stage_path}.on_defeat")
        resource_group = stage.get("resource_bank_group", stage.get("bank_group"))
        if resource_group is not None and (not isinstance(resource_group, str) or not resource_group):
            raise SystemExit(f"{stage_path}.resource_bank_group precisa ser string nao vazia")
        resource_group_expr = cpp_string_literal(resource_group) if isinstance(resource_group, str) else "nullptr"
        hitstun_decay = float(config.get("hitstun_decay", 0.85))
        if not math.isfinite(hitstun_decay):
            raise SystemExit(f"{stage_path}.config.hitstun_decay precisa ser numero finito")
        stage_entries.append(
            "    gbs::LutaStageData { "
            f"{cpp_string_literal(stage.get('name', f'stage_{stage_index}'))}, "
            f"{max(1, min(65535, int(config.get('round_time', 99))))}u, "
            f"{max(1, min(255, int(config.get('rounds_to_win', 2))))}u, "
            f"{max_super_gauge}u, "
            f"{max(0, min(255, int(config.get('super_gauge_gain_on_hit', 8))))}u, "
            f"{max(0, min(255, int(config.get('super_gauge_gain_on_receive', 4))))}u, "
            f"{max(0, min(255, int(config.get('guard_power_recovery', 2))))}u, "
            f"{'true' if bool(config.get('chip_damage_enabled', True)) else 'false'}, "
            f"{'true' if bool(config.get('air_blocking_enabled', True)) else 'false'}, "
            f"{'true' if bool(config.get('alpha_counter_enabled', True)) else 'false'}, "
            f"{max(0, min(255, int(config.get('throw_escape_window', 8))))}u, "
            f"{max(0, min(255, int(config.get('parry_window', 4))))}u, "
            f"{hitstun_decay:.6g}f, "
            f"{max(1, min(255, int(config.get('combo_limit', 60))))}u, "
            f"{max(0, min(65535, int(config.get('vism_custom_combo_gauge', 100))))}u, "
            f"{luta_ism_style_from_json(config.get('default_style', 'a-ism'), f'{stage_path}.config.default_style')}, "
            f"{cpp_string_literal(config.get('stage_id', stage.get('name', f'stage_{stage_index}')))}, "
            f"{max(0, min(65535, int(config.get('player1_start_x', 80))))}u, "
            f"{max(0, min(65535, int(config.get('player2_start_x', 200))))}u, "
            f"{characters_name}, {character_count}, {player1_name}, {player1_count}, {player2_name}, {player2_count}, "
            f"nullptr, 0, {backgrounds_name}, {background_count}, {on_enter}, {on_victory}, {on_defeat}, "
            f"{int(stage.get('background', stage.get('background_index', -1)))}, {resource_group_expr} "
            "},"
        )

    output.append("constexpr gbs::LutaStageData stages[] = {")
    output.extend(stage_entries)
    output.extend(["};", ""])
    initial_stage = require_int(luta_project.get("initial_stage", 0), "luta_project.initial_stage", 0, len(stages) - 1)
    output.extend([
        "constexpr gbs::LutaProjectData project {",
        "    stages,",
        f"    {len(stages)},",
        f"    {initial_stage},",
        f"    {resource_bank_groups_name},",
        f"    {resource_bank_group_count},",
        f"    {resource_bank_upload_sources_name},",
        f"    {resource_bank_upload_source_count},",
        f"    {asset_refs['bg_palettes'][0]},",
        f"    {asset_refs['bg_palettes'][1]},",
        f"    {asset_refs['obj_palettes'][0]},",
        f"    {asset_refs['obj_palettes'][1]},",
        f"    {asset_refs['tile_assets'][0]},",
        f"    {asset_refs['tile_assets'][1]},",
        f"    {asset_refs['sfx_assets'][0]},",
        f"    {asset_refs['sfx_assets'][1]},",
        f"    {asset_refs['music_assets'][0]},",
        f"    {asset_refs['music_assets'][1]},",
        f"    {asset_refs['pcm_assets'][0]},",
        f"    {asset_refs['pcm_assets'][1]},",
        f"    {asset_refs['tracker_assets'][0]},",
        f"    {asset_refs['tracker_assets'][1]},",
        f"    {dialogue_lines_name},",
        f"    {dialogue_line_count},",
        "    &save_bank,",
        "    save_enabled,",
        "    save_autosave,",
        f"    {hud_name}",
        "};",
        "",
        "} // namespace gbastudio_luta_project",
        "",
    ])
    return "\n".join(output)


def bake_indexed_isometric(room, source_tiles, source_map, source_columns, destination_tile, bits_per_pixel=4):
    """Compile editable modules into shared indexed tiles; never resample pixels."""
    camera = room.get('camera', {})
    if int(camera.get('zoom_x256', 256)) != 256 or int(camera.get('target_zoom_x256', 256)) != 256:
        raise SystemExit('Native isometric composition requires zoom 256 (100%)')
    grid = room.get('grid', {})
    tw, th = int(grid.get('tile_width_pixels', 32)), int(grid.get('tile_height_pixels', 16))
    rw, rh = int(room.get('tileset_render_width_pixels', tw)), int(room.get('tileset_render_height_pixels', th))
    offset = int(room.get('tileset_render_offset_y_pixels', 0))
    width, height = int(room['width_tiles']), int(room['height_tiles'])
    origin = grid.get('origin', {})
    heights = room.get('height_levels', [0] * (width * height))
    positions = [(int(origin.get('x', 0)) + (x-y)*tw//2-rw//2,
                  int(origin.get('y', 0)) + (x+y)*th//2-int(heights[y*width+x])*int(grid.get('height_step_pixels', 8))+offset)
                 for y in range(height) for x in range(width)]
    left, top = min(x for x,y in positions)//8*8, min(y for x,y in positions)//8*8
    right = (max(x for x,y in positions)+rw+7)//8*8
    bottom = (max(y for x,y in positions)+rh+7)//8*8
    pw, ph = right-left, bottom-top
    layers = room.get('background_layers', {})
    unique = [bytes(64)]
    lookup = {unique[0]: 0}
    maps = []
    for cells in [room['visual_tiles'], layers.get('bg1', [0]*(width*height))]:
        pixels = bytearray(pw*ph)
        for index in sorted(range(width*height), key=lambda i: i%width+i//width):
            module = int(cells[index])-1
            if module < 0: continue
            sx0 = (module % (source_columns*8//rw))*rw
            sy0 = (module // (source_columns*8//rw))*rh
            dx, dy = positions[index]
            for y in range(rh):
                for x in range(rw):
                    sx, sy = sx0+x, sy0+y
                    entry = source_map[(sy//8)*source_columns+sx//8]
                    tile = (entry & 1023)-destination_tile
                    if tile < 0: continue
                    lx, ly = sx%8, sy%8
                    if entry & 1024: lx = 7-lx
                    if entry & 2048: ly = 7-ly
                    color = source_tiles[tile*64+ly*8+lx] if bits_per_pixel == 8 else (source_tiles[tile*32+ly*4+lx//2] >> ((lx%2)*4)) & 15
                    if color: pixels[(dy-top+y)*pw+dx-left+x] = color if bits_per_pixel == 8 else color | ((entry >> 8) & 240)
        mapping = []
        for ty in range(ph//8):
            for tx in range(pw//8):
                tile = bytes(v for y in range(8) for v in pixels[(ty*8+y)*pw+tx*8:(ty*8+y)*pw+tx*8+8])
                if tile not in lookup:
                    lookup[tile] = len(unique)
                    unique.append(tile)
                mapping.append(lookup[tile])
        maps.append(mapping)
    if len(unique) > 768:
        raise SystemExit(f"Indexed isometric composition requires {len(unique)} tiles; maximum is 768 before UI/maps")
    return {'tiles': unique, 'background': maps[0], 'foreground': maps[1],
            'width': pw//8, 'height': ph//8, 'x': left, 'y': top}


def compose_isometric_paged_surface(back, front):
    """Keep BG tiles in ROM and reserve 651 rolling BG slots plus resident rails."""
    if (back['width'], back['height']) != (front['width'], front['height']):
        raise SystemExit('Paged isometric surface dimensions must match')
    if not 0 < len(front['tiles']) <= 117:
        raise SystemExit('Paged isometric foreground exceeds the 117 resident tiles')
    palette = [0] + back['palette'] + front['palette'][1:]
    if len(palette) > 224:
        raise SystemExit('Paged isometric palette exceeds 224 colors with UI reserved')
    for source in (back, front):
        if len(source['entries']) != source['width'] * source['height']:
            raise SystemExit('Paged isometric surface dimensions do not match the map')
        if any(index < 0 or index >= len(source['tiles']) for index in source['entries']):
            raise SystemExit('Paged isometric map has an invalid ROM tile index')
        if any(len(tile) != 64 or any(pixel >= len(source['palette']) for pixel in tile) for tile in source['tiles']):
            raise SystemExit('Paged isometric tile has an invalid palette index')
    first = len(back['tiles'])
    if first + len(front['tiles']) > 65535:
        raise SystemExit('Paged isometric ROM tile index exceeds uint16')
    # GBA index zero is transparent. Reserve it so HUD/dialogue backdrop changes
    # cannot turn the opaque ocean into holes, while preserving every RGB555 color.
    tiles = [bytes(pixel + 1 for pixel in tile) for tile in back['tiles']]
    tiles += [bytes(pixel + len(back['palette']) if pixel else 0 for pixel in tile) for tile in front['tiles']]
    return dict(tiles=tiles, background=back['entries'], foreground=[first + index for index in front['entries']],
                palette=palette, foreground_first_tile=first, width=back['width'], height=back['height'], x=0, y=0)


def emit_paged_isometric_reference(output, prefix, room, output_dir, source_assets):
    surface = room['paged_surface']
    grid = room.get('grid', {})
    if room.get('world_mode') != 'scrollable_tiled_world' or grid.get('gameplay_mode', 'adventure') != 'adventure' or grid.get('movement_model', 'free') != 'free':
        raise SystemExit('Paged isometric surface requires scrollable adventure with free movement')
    if room.get('tileset') or room.get('authored_background'):
        raise SystemExit('Paged isometric surface cannot also declare tileset or authored_background')
    def read_source(name):
        asset = next((asset for asset in (source_assets or []) if asset.get('name') == name), None)
        if asset is None or asset.get('kind') != 'paged_bg':
            raise SystemExit(f'{name}: isometric surface requires a paged_bg asset')
        source = (output_dir / (name + '.hpp')).read_text(encoding='utf-8')
        def values(suffix):
            match = re.search(r'constexpr uint(?:8|16)_t ' + re.escape(name + suffix) + r'[^=]*=\s*\{(.*?)\};', source, re.S)
            if not match: raise SystemExit(f'{name}: missing paged data {suffix}')
            return [int(value, 16) for value in re.findall(r'0x[0-9a-fA-F]+', match.group(1))]
        def dimension(suffix):
            match = re.search(re.escape(name + suffix) + r'\s*=\s*(\d+)', source)
            if not match: raise SystemExit(f'{name}: missing paged dimensions')
            return int(match.group(1))
        pixels = values('_tiles')
        return dict(width=dimension('_tilemap_width'), height=dimension('_tilemap_height'), palette=values('_palette'),
                    tiles=[bytes(pixels[i:i+64]) for i in range(0, len(pixels), 64)], entries=values('_tilemap_entries'))
    front_asset = next((asset for asset in (source_assets or []) if asset.get('name') == surface['foreground']), {})
    if front_asset.get('paged_palette_owner') != surface['background']:
        raise SystemExit('Paged isometric foreground must share its background palette reservation')
    baked = compose_isometric_paged_surface(read_source(surface['background']), read_source(surface['foreground']))
    if baked['width'] * 8 != surface['width'] or baked['height'] * 8 != surface['height']:
        raise SystemExit('Paged isometric declared dimensions differ from compiled PNG dimensions')
    for suffix, ctype, data in [('tiles', 'uint8_t', [v for tile in baked['tiles'] for v in tile]),
                               ('background', 'uint16_t', baked['background']), ('foreground', 'uint16_t', baked['foreground']),
                               ('palette_colors', 'uint16_t', baked['palette'])]:
        output.append(f'alignas(4) constexpr {ctype} {prefix}_paged_{suffix}[] = {{' + ','.join(map(str, data)) + '};')
    output.append(f"constexpr gbs::PaletteAsset {prefix}_paged_palette {{ {prefix}_paged_palette_colors, {len(baked['palette'])}, 0 }};")
    output.append(f"constexpr gbs::IsoBakedComposition {prefix}_paged {{ {prefix}_paged_tiles, {len(baked['tiles'])}, "
                  f"{prefix}_paged_background, {prefix}_paged_foreground, {baked['width']}, {baked['height']}, "
                  f"{{0, 0}}, &{prefix}_paged_palette, {baked['foreground_first_tile']} }};")
    return f'&{prefix}_paged'


def emit_baked_isometric_reference(output, prefix, room, asset_report, output_dir, source_assets=None, base_dir=None):
    if room.get('paged_surface'):
        return emit_paged_isometric_reference(output, prefix, room, output_dir, source_assets)
    if output_dir is None or not room.get('tileset_render_offset_y_pixels'):
        return 'nullptr'
    name = room['tileset']
    source = (output_dir / (name + '.hpp')).read_text(encoding='utf-8')
    def values(suffix):
        match = re.search(r'constexpr uint(?:8|16)_t ' + re.escape(name + suffix) + r'[^=]*=\s*\{(.*?)\};', source, re.S)
        if not match:
            raise SystemExit(f"Cannot bake uncompressed indexed source {name}{suffix}")
        return [int(value, 16) for value in re.findall(r'0x[0-9a-fA-F]+', match.group(1))]
    report = asset_report['asset_reports'][name]
    palette_reference = 'nullptr'
    source_asset = next((asset for asset in (source_assets or []) if asset.get('name') == name), None)
    if source_asset is not None:
        width, height, colors, indices, transparent = read_png(base_dir / source_asset['png'], max_colors=None, include_transparency=True)
        palette = [0]
        lookup = {}
        indexed = []
        for index in indices:
            if index == transparent:
                indexed.append(0)
                continue
            color = rgb15(colors[index])
            if color not in lookup:
                lookup[color] = len(palette)
                palette.append(color)
            indexed.append(lookup[color])
        if len(palette) > 224:
            raise SystemExit(f'{name}: native isometric palette needs {len(palette)} colors; maximum is 224 with UI reserved')
        tiles = bytes(v for ty in range(height//8) for tx in range(width//8)
                      for y in range(8) for v in indexed[(ty*8+y)*width+tx*8:(ty*8+y)*width+tx*8+8])
        baked = bake_indexed_isometric(room, tiles, list(range(width*height//64)), width//8, 0, bits_per_pixel=8)
        output.append(f'constexpr uint16_t {prefix}_baked_palette_colors[] = {{' + ','.join(map(str, palette)) + '};')
        output.append(f'constexpr gbs::PaletteAsset {prefix}_baked_palette {{ {prefix}_baked_palette_colors, {len(palette)}, 0 }};')
        palette_reference = f'&{prefix}_baked_palette'
    else:
        baked = bake_indexed_isometric(room, bytes(values('_tiles')), values('_tilemap'),
                                       report['resources']['tilemap_width'], report['allocations']['bg_tiles']['start'])
    for suffix, ctype, data in [('tiles', 'uint8_t', [v for tile in baked['tiles'] for v in tile]),
                                ('background', 'uint16_t', baked['background']),
                                ('foreground', 'uint16_t', baked['foreground'])]:
        output.append(f"alignas(4) constexpr {ctype} {prefix}_baked_{suffix}[] = {{" + ','.join(map(str, data)) + '};')
    output.append(f"constexpr gbs::IsoBakedComposition {prefix}_baked {{ {prefix}_baked_tiles, {len(baked['tiles'])}, "
                  f"{prefix}_baked_background, {prefix}_baked_foreground, {baked['width']}, {baked['height']}, "
                  f"{{ {baked['x']}, {baked['y']} }}, {palette_reference} }};")
    return f'&{prefix}_baked'


def emit_isometric_project_data_header(isometric_project, asset_report=None, base_dir=None, output_dir=None, source_assets=None):
    if not isinstance(isometric_project, dict):
        raise SystemExit("isometric_project precisa ser objeto")

    rooms = isometric_project.get("rooms")
    if not isinstance(rooms, list) or not rooms:
        raise SystemExit("isometric_project.rooms precisa ser lista nao vazia")

    initial_room = int(isometric_project.get("initial_room", 0))
    backdrop_color = int(isometric_project.get("backdrop_color", 0))
    video_literal = video_composition_literal(isometric_project, "isometric_project", asset_report)
    project_grid = isometric_project.get("grid", {})
    project_camera = isometric_project.get("camera", {})
    includes = merge_includes(
        string_list_from_json(isometric_project.get("includes", []), "isometric_project.includes"),
        project_auto_includes(isometric_project, asset_report),
    )
    save_config = save_config_from_json(isometric_project.get("save"), "isometric_project.save", "GBIS", 1024)

    output = [
        "#pragma once",
        "",
        '#include "gbs/engine.hpp"',
        '#include "gbs/isometric.hpp"',
    ]
    for include in includes:
        output.append(f'#include "{include}"')
    output.extend([
        "",
        "namespace gbastudio_isometric_project {",
        "",
    ])
    asset_refs = emit_project_asset_references(output, isometric_project, "isometric_project", "project", include_audio=True, asset_report=asset_report)
    emit_save_config(output, save_config)
    resource_banks_name, resource_bank_count, resource_bank_groups_name, resource_bank_group_count = emit_project_resource_banks(output, isometric_project, "isometric_project", asset_report)
    emit_resource_bank_upload_sources(output, asset_report)
    dialogue_lines_name, dialogue_line_count = emit_dialogue_lines(
        output,
        isometric_project.get("dialogue_lines", []),
        "isometric_project.dialogue_lines",
    )
    project_script_entries = []
    project_scripts = isometric_project.get("scripts", isometric_project.get("event_scripts", []))
    if project_scripts is None:
        project_scripts = []
    if not isinstance(project_scripts, list):
        raise SystemExit("isometric_project.scripts precisa ser lista")
    for script_index, script in enumerate(project_scripts):
        commands = script.get("script", script.get("commands", [])) if isinstance(script, dict) else script
        project_script_entries.append(emit_event_script(
            output,
            f"isometric_project_script_{script_index}",
            commands,
            f"isometric_project.scripts[{script_index}]",
        ))
    project_scripts_name = "nullptr"
    project_script_count = 0
    if project_script_entries:
        project_scripts_name = "project_scripts"
        project_script_count = len(project_script_entries)
        output.append("constexpr gbs::EventScript project_scripts[] = {")
        for script in project_script_entries:
            output.append(f"    {script},")
        output.append("};")
        output.append("")

    room_entries = []
    for room_index, room in enumerate(rooms):
        if not isinstance(room, dict):
            raise SystemExit(f"isometric_project.rooms[{room_index}] precisa ser objeto")
        world_mode = room.get("world_mode", "scrollable_tiled_world")
        if world_mode not in ("scrollable_tiled_world", "static_composition"):
            raise SystemExit(
                f"isometric_project.rooms[{room_index}].world_mode precisa ser "
                "scrollable_tiled_world ou static_composition"
            )
        width = int(room.get("width_tiles", 0))
        height = int(room.get("height_tiles", 0))
        if not has_valid_streaming_room_dimensions(width, height):
            raise SystemExit(f"isometric_project.rooms[{room_index}] dimensoes invalidas")
        tile_count = width * height
        prefix = pack_safe_identifier(room.get("name", f"room_{room_index}"))
        visual = int_list_from_json(
            room.get("visual_tiles"),
            tile_count,
            f"isometric_project.rooms[{room_index}].visual_tiles",
        )
        collision = int_list_from_json(
            room.get("collision_flags"),
            tile_count,
            f"isometric_project.rooms[{room_index}].collision_flags",
        )
        ramp_flags = int_list_from_json(
            room.get("ramp_flags", [0] * tile_count),
            tile_count,
            f"isometric_project.rooms[{room_index}].ramp_flags",
        )
        height_levels = int_list_from_json(
            room.get("height_levels", [0] * tile_count),
            tile_count,
            f"isometric_project.rooms[{room_index}].height_levels",
        )
        output.append(format_cpp_u8_array(f"{prefix}_visual_tiles", visual))
        output.append("")
        output.append(format_cpp_u8_array(f"{prefix}_collision_flags", collision))
        output.append("")
        output.append(format_cpp_u8_array(f"{prefix}_ramp_flags", ramp_flags))
        output.append("")
        output.append(format_cpp_u8_array(f"{prefix}_height_levels", height_levels))
        output.append("")
        background_layers = room.get("background_layers", {})
        if not isinstance(background_layers, dict):
            raise SystemExit(f"isometric_project.rooms[{room_index}].background_layers precisa ser objeto")
        background_layer_names = {
            "bg3": "nullptr",
            "bg2": f"{prefix}_visual_tiles",
            "bg1": "nullptr",
            "bg0": "nullptr",
        }
        for mapping in ("bg3", "bg2", "bg1", "bg0"):
            if mapping not in background_layers:
                continue
            values = int_list_from_json(
                background_layers.get(mapping),
                tile_count,
                f"isometric_project.rooms[{room_index}].background_layers.{mapping}",
            )
            layer_name = f"{prefix}_{mapping}_tiles"
            output.append(format_cpp_u8_array(layer_name, values))
            output.append("")
            background_layer_names[mapping] = layer_name
        on_enter_script = emit_event_script(
            output,
            f"{prefix}_on_enter",
            room.get("on_enter"),
            f"isometric_project.rooms[{room_index}].on_enter",
        )
        on_exit_script = emit_event_script(
            output,
            f"{prefix}_on_exit",
            room.get("on_exit"),
            f"isometric_project.rooms[{room_index}].on_exit",
        )
        on_update_script = emit_event_script(
            output,
            f"{prefix}_on_update",
            room.get("on_update"),
            f"isometric_project.rooms[{room_index}].on_update",
        )
        on_hit_group_scripts = []
        for group_index in (1, 2, 3):
            on_hit_group_scripts.append(emit_event_script(
                output,
                f"{prefix}_on_hit_group{group_index}",
                room.get(f"on_hit_group{group_index}"),
                f"isometric_project.rooms[{room_index}].on_hit_group{group_index}",
            ))
        triggers_name, trigger_count = emit_runtime_triggers(
            output,
            prefix,
            room,
            f"isometric_project.rooms[{room_index}]",
        )

        actors = room.get("actors", room.get("initial_actors", []))
        if not isinstance(actors, list) or not actors:
            raise SystemExit(f"isometric_project.rooms[{room_index}].actors precisa ser lista nao vazia")
        actors_name = f"{prefix}_actors"
        actor_animation_sets = []
        actor_animation_lookups = []
        for actor_index, actor in enumerate(actors):
            if not isinstance(actor, dict):
                raise SystemExit(f"isometric_project.rooms[{room_index}].actors[{actor_index}] precisa ser objeto")
            actor_animation_set, actor_animation_lookup = emit_isometric_actor_animation_set(
                output,
                f"{prefix}_actor_{actor_index}",
                actor,
                asset_report,
                f"isometric_project.rooms[{room_index}].actors[{actor_index}]",
                base_dir,
            )
            actor_animation_sets.append(actor_animation_set)
            actor_animation_lookups.append(actor_animation_lookup)
        actor_animations_name = f"{prefix}_actor_animations"
        output.append(f"constexpr gbs::IsoActorAnimationSet {actor_animations_name}[] = {{")
        for animation_set in actor_animation_sets:
            output.append(f"    {animation_set},")
        output.append("};")
        output.append("")
        actor_interact_event_entries = []
        actor_start_event_entries = []
        actor_update_event_entries = []
        actor_event_sources = []
        output.append(f"constexpr gbs::IsoActor {actors_name}[] = {{")
        for actor_index, actor in enumerate(actors):
            if not isinstance(actor, dict):
                raise SystemExit(f"isometric_project.rooms[{room_index}].actors[{actor_index}] precisa ser objeto")
            tile = actor.get("tile", {})
            if not isinstance(tile, dict):
                raise SystemExit(f"isometric_project.rooms[{room_index}].actors[{actor_index}].tile precisa ser objeto")
            offset = vec2_from_json(
                actor.get("screen_offset", actor.get("screen_offset_pixels", {"x": 0, "y": 0})),
                f"isometric_project.rooms[{room_index}].actors[{actor_index}].screen_offset",
            )
            tile_index_expr, palette_expr = resolve_isometric_actor_visual_exprs(
                actor,
                asset_report,
                f"isometric_project.rooms[{room_index}].actors[{actor_index}]",
            )
            actor_size = vec2_from_json(
                actor.get("size", actor.get("size_pixels", {"x": 16, "y": 16})),
                f"isometric_project.rooms[{room_index}].actors[{actor_index}].size",
            )
            output.append(
                "    gbs::IsoActor { "
                f"gbs::IsoCoord {{ {int(tile.get('x', 0))}, {int(tile.get('y', 0))}, {int(tile.get('z', 0))} }}, "
                f"gbs::Vec2i {{ {offset[0]}, {offset[1]} }}, "
                f"{tile_index_expr}, "
                f"{palette_expr}, "
                f"{'true' if bool(actor.get('visible', True)) else 'false'}, "
                f"{'true' if bool(actor.get('hflip', False)) else 'false'}, "
                f"static_cast<uint8_t>({int(actor.get('priority', 0))}), "
                f"static_cast<uint8_t>({actor_size[0]}), "
                f"static_cast<uint8_t>({actor_size[1]}), "
                f"{'true' if bool(actor.get('follow_player', True)) else 'false'}, "
                "nullptr, "
                "nullptr, "
                "0, "
                "0, "
                "false, "
                f"static_cast<uint8_t>({max(0, min(15, int(actor.get('collision_group', 0))))}) "
                "},"
            )
            actor_event_sources.append((
                actor_index,
                actor.get("on_interact", actor.get("script")),
                actor.get("on_start"),
                actor.get("on_update"),
            ))
        output.append("};")
        output.append("")
        tactical_presentation_expr = emit_isometric_tactical_presentation(
            output,
            prefix,
            room.get("tactical_presentation"),
            actors,
            actor_animation_lookups,
            asset_report,
            f"isometric_project.rooms[{room_index}].tactical_presentation",
        )
        for actor_index, interact_commands, start_commands, update_commands in actor_event_sources:
            interact_script = emit_event_script(
                output,
                f"{prefix}_actor_{actor_index}_interact",
                interact_commands,
                f"isometric_project.rooms[{room_index}].actors[{actor_index}].on_interact",
            )
            if interact_script != "gbs::empty_event_script()":
                actor_interact_event_entries.append((actor_index, interact_script))
            start_script = emit_event_script(
                output,
                f"{prefix}_actor_{actor_index}_start",
                start_commands,
                f"isometric_project.rooms[{room_index}].actors[{actor_index}].on_start",
            )
            if start_script != "gbs::empty_event_script()":
                actor_start_event_entries.append((actor_index, start_script))
            update_script = emit_event_script(
                output,
                f"{prefix}_actor_{actor_index}_update",
                update_commands,
                f"isometric_project.rooms[{room_index}].actors[{actor_index}].on_update",
            )
            if update_script != "gbs::empty_event_script()":
                actor_update_event_entries.append((actor_index, update_script))
        actor_interact_events_name = "nullptr"
        actor_interact_event_count = 0
        if actor_interact_event_entries:
            actor_interact_events_name = f"{prefix}_actor_interact_events"
            actor_interact_event_count = len(actor_interact_event_entries)
            output.append(f"constexpr gbs::IsoActorEventData {actor_interact_events_name}[] = {{")
            for actor_index, script in actor_interact_event_entries:
                output.append(f"    gbs::IsoActorEventData {{ {actor_index}, {script} }},")
            output.append("};")
            output.append("")
        actor_start_events_name = "nullptr"
        actor_start_event_count = 0
        if actor_start_event_entries:
            actor_start_events_name = f"{prefix}_actor_start_events"
            actor_start_event_count = len(actor_start_event_entries)
            output.append(f"constexpr gbs::IsoActorEventData {actor_start_events_name}[] = {{")
            for actor_index, script in actor_start_event_entries:
                output.append(f"    gbs::IsoActorEventData {{ {actor_index}, {script} }},")
            output.append("};")
            output.append("")
        actor_update_events_name = "nullptr"
        actor_update_event_count = 0
        if actor_update_event_entries:
            actor_update_events_name = f"{prefix}_actor_update_events"
            actor_update_event_count = len(actor_update_event_entries)
            output.append(f"constexpr gbs::IsoActorEventData {actor_update_events_name}[] = {{")
            for actor_index, script in actor_update_event_entries:
                output.append(f"    gbs::IsoActorEventData {{ {actor_index}, {script} }},")
            output.append("};")
            output.append("")

        tile_events = room.get("tile_events", room.get("tile_interactions", []))
        if not isinstance(tile_events, list):
            raise SystemExit(f"isometric_project.rooms[{room_index}].tile_events precisa ser lista")
        tile_event_entries = []
        for tile_event_index, tile_event in enumerate(tile_events):
            if not isinstance(tile_event, dict):
                raise SystemExit(f"isometric_project.rooms[{room_index}].tile_events[{tile_event_index}] precisa ser objeto")
            area = tile_event.get("area", tile_event.get("bounds", None))
            if area is not None:
                if not isinstance(area, dict):
                    raise SystemExit(f"isometric_project.rooms[{room_index}].tile_events[{tile_event_index}].area precisa ser objeto")
                tile = area.get("tile", area)
                width_tiles = int(area.get("width_tiles", area.get("width", 1)))
                height_tiles = int(area.get("height_tiles", area.get("height", 1)))
            else:
                tile = tile_event.get("tile", tile_event)
                width_tiles = int(tile_event.get("width_tiles", tile_event.get("width", 1)))
                height_tiles = int(tile_event.get("height_tiles", tile_event.get("height", 1)))
            if not isinstance(tile, dict):
                raise SystemExit(f"isometric_project.rooms[{room_index}].tile_events[{tile_event_index}].tile precisa ser objeto")
            if width_tiles <= 0 or height_tiles <= 0:
                raise SystemExit(f"isometric_project.rooms[{room_index}].tile_events[{tile_event_index}] area invalida")
            tile_script = emit_event_script(
                output,
                f"{prefix}_tile_event_{tile_event_index}",
                tile_event.get("on_interact", tile_event.get("on_select", tile_event.get("on_activate", tile_event.get("script")))),
                f"isometric_project.rooms[{room_index}].tile_events[{tile_event_index}].on_interact",
            )
            if tile_script != "gbs::empty_event_script()":
                tile_event_entries.append((
                    int(tile.get("x", 0)),
                    int(tile.get("y", 0)),
                    int(tile.get("z", 0)),
                    width_tiles,
                    height_tiles,
                    tile_script,
                ))
        tile_events_name = "nullptr"
        tile_event_count = 0
        if tile_event_entries:
            tile_events_name = f"{prefix}_tile_events"
            tile_event_count = len(tile_event_entries)
            output.append(f"constexpr gbs::IsoTileEventData {tile_events_name}[] = {{")
            for tile_x, tile_y, tile_z, width_tiles, height_tiles, script in tile_event_entries:
                output.append(
                    "    gbs::IsoTileEventData { "
                    f"gbs::IsoCoord {{ {tile_x}, {tile_y}, {tile_z} }}, {script}, {width_tiles}, {height_tiles} "
                    "},"
                )
            output.append("};")
            output.append("")

        camera_zones = room.get("camera_zones", [])
        if not isinstance(camera_zones, list):
            raise SystemExit(f"isometric_project.rooms[{room_index}].camera_zones precisa ser lista")
        camera_zones_name = "nullptr"
        camera_zone_count = 0
        if camera_zones:
            camera_zones_name = f"{prefix}_camera_zones"
            camera_zone_count = len(camera_zones)
            output.append(f"constexpr gbs::IsoCameraZone {camera_zones_name}[] = {{")
            for zone_index, zone in enumerate(camera_zones):
                if not isinstance(zone, dict):
                    raise SystemExit(f"isometric_project.rooms[{room_index}].camera_zones[{zone_index}] precisa ser objeto")
                area = rect_from_json(zone.get("area"), f"isometric_project.rooms[{room_index}].camera_zones[{zone_index}].area")
                bounds = rect_from_json(zone.get("bounds", zone.get("bounds_pixels")), f"isometric_project.rooms[{room_index}].camera_zones[{zone_index}].bounds")
                offset = vec2_from_json(zone.get("offset", zone.get("offset_pixels", {"x": 0, "y": 0})), f"isometric_project.rooms[{room_index}].camera_zones[{zone_index}].offset")
                output.append(
                    "    gbs::IsoCameraZone { "
                    f"gbs::Rect {{ {area[0]}, {area[1]}, {area[2]}, {area[3]} }}, "
                    f"gbs::Rect {{ {bounds[0]}, {bounds[1]}, {bounds[2]}, {bounds[3]} }}, "
                    f"gbs::Vec2i {{ {offset[0]}, {offset[1]} }}, "
                    f"{'true' if bool(zone.get('lock_x', False)) else 'false'}, "
                    f"{'true' if bool(zone.get('lock_y', False)) else 'false'} "
                    "},"
                )
            output.append("};")
            output.append("")

        grid_expr = emit_iso_grid_config(room.get("grid", project_grid), f"isometric_project.rooms[{room_index}].grid")
        camera_expr = emit_iso_camera(
            room.get("camera", room.get("camera_start", project_camera)),
            f"isometric_project.rooms[{room_index}].camera",
        )
        room_name = cpp_string_literal(room.get("name", f"room_{room_index}"))
        room_bank_group = room.get("resource_bank_group", room.get("bank_group", None))
        if room_bank_group is not None and not isinstance(room_bank_group, str):
            raise SystemExit(f"isometric_project.rooms[{room_index}].resource_bank_group precisa ser string")
        room_bank_group_literal = cpp_string_literal(room_bank_group) if room_bank_group else "nullptr"
        cursor_start = room.get("cursor_start", room.get("selection_start", None))
        cursor_start_enabled = cursor_start is not None
        if cursor_start is None:
            cursor_start_tile = {}
        elif isinstance(cursor_start, dict):
            cursor_start_tile = cursor_start.get("tile", cursor_start)
            if not isinstance(cursor_start_tile, dict):
                raise SystemExit(f"isometric_project.rooms[{room_index}].cursor_start.tile precisa ser objeto")
        else:
            raise SystemExit(f"isometric_project.rooms[{room_index}].cursor_start precisa ser objeto")
        cursor_start_expr = (
            f"gbs::IsoCoord {{ {int(cursor_start_tile.get('x', 0))}, {int(cursor_start_tile.get('y', 0))}, {int(cursor_start_tile.get('z', 0))} }}"
        )
        room_grid = room.get("grid", project_grid)
        if not isinstance(room_grid, dict):
            raise SystemExit(f"isometric_project.rooms[{room_index}].grid precisa ser objeto")
        gameplay_mode = room_grid.get("gameplay_mode", "adventure")
        if gameplay_mode not in ("adventure", "tactical"):
            raise SystemExit(
                f"isometric_project.rooms[{room_index}].grid.gameplay_mode precisa ser adventure ou tactical"
            )
        movement_model = room_grid.get("movement_model", "tile" if gameplay_mode == "tactical" else "free")
        if movement_model not in ("free", "tile"):
            raise SystemExit(
                f"isometric_project.rooms[{room_index}].grid.movement_model precisa ser free ou tile"
            )
        expected_movement_model = "tile" if gameplay_mode == "tactical" else "free"
        if movement_model != expected_movement_model:
            raise SystemExit(
                f"isometric_project.rooms[{room_index}].grid.movement_model precisa ser {expected_movement_model} "
                f"quando gameplay_mode é {gameplay_mode}"
            )
        tileset = room.get("tileset", room.get("tileset_asset", None))
        tileset_tilemap_expr = "nullptr"
        tileset_tiles_expr = "nullptr"
        if tileset is not None:
            if not isinstance(tileset, str) or not tileset:
                raise SystemExit(f"isometric_project.rooms[{room_index}].tileset precisa ser string")
            tileset_tilemap_symbol = resolve_project_asset_symbol(
                tileset,
                "tilemap",
                asset_report,
                f"isometric_project.rooms[{room_index}].tileset",
            )
            tileset_tilemap_expr = f"&{tileset_tilemap_symbol}"
            tileset_tiles_symbol = resolve_project_asset_symbol(
                tileset,
                "tile_assets",
                asset_report,
                f"isometric_project.rooms[{room_index}].tileset",
            )
            tileset_tiles_expr = f"&{tileset_tiles_symbol}"
        authored_background = room.get("authored_background", None)
        if world_mode == "static_composition" and not authored_background:
            raise SystemExit(
                f"isometric_project.rooms[{room_index}] estática precisa declarar authored_background"
            )
        if world_mode == "scrollable_tiled_world" and authored_background:
            raise SystemExit(
                f"isometric_project.rooms[{room_index}] navegável não pode declarar authored_background; "
                "use o tileset e o mapa de meta-tiles"
            )
        authored_background_tilemap_expr = "nullptr"
        if authored_background is not None:
            if not isinstance(authored_background, str) or not authored_background:
                raise SystemExit(f"isometric_project.rooms[{room_index}].authored_background precisa ser string")
            authored_background_tilemap_symbol = resolve_project_asset_symbol(
                authored_background,
                "tilemap",
                asset_report,
                f"isometric_project.rooms[{room_index}].authored_background",
            )
            authored_background_tilemap_expr = f"&{authored_background_tilemap_symbol}"
        world_mode_expr = (
            "gbs::IsoWorldMode::StaticComposition"
            if world_mode == "static_composition"
            else "gbs::IsoWorldMode::ScrollableTiledWorld"
        )
        gameplay_mode_expr = (
            "gbs::IsoGameplayMode::Tactical"
            if gameplay_mode == "tactical"
            else "gbs::IsoGameplayMode::Adventure"
        )
        tactical_expr = "nullptr"
        tactical_config = room.get("tactical")
        if gameplay_mode == "tactical":
            if not isinstance(tactical_config, dict) or tactical_config.get("enabled") is not True:
                raise SystemExit(
                    f"isometric_project.rooms[{room_index}] tática precisa declarar tactical.enabled=true"
                )
            tactical_units = tactical_config.get("units", [])
            if not isinstance(tactical_units, list) or not tactical_units:
                raise SystemExit(
                    f"isometric_project.rooms[{room_index}].tactical.units precisa ser lista nao vazia"
                )
            tactical_unit_name = f"{prefix}_tactical_units"
            output.append(f"constexpr gbs::IsoTacticalUnitData {tactical_unit_name}[] = {{")
            for unit_index, unit in enumerate(tactical_units):
                if not isinstance(unit, dict):
                    raise SystemExit(
                        f"isometric_project.rooms[{room_index}].tactical.units[{unit_index}] precisa ser objeto"
                    )
                actor_index = int(unit.get("actor_index", unit.get("actorIndex", -1)))
                if actor_index < 0 or actor_index >= len(actors):
                    raise SystemExit(
                        f"isometric_project.rooms[{room_index}].tactical.units[{unit_index}].actor_index fora dos atores"
                    )
                team = unit.get("team", "player")
                if team not in ("player", "enemy"):
                    raise SystemExit(
                        f"isometric_project.rooms[{room_index}].tactical.units[{unit_index}].team invalido"
                    )
                move_range = max(1, min(15, int(unit.get("move_range", unit.get("moveRange", 1)))))
                attack_range = max(1, min(15, int(unit.get("attack_range", unit.get("attackRange", 1)))))
                max_hp = max(1, min(255, int(unit.get("max_hp", unit.get("maxHp", 1)))))
                attack_power = max(1, min(255, int(unit.get("attack_power", unit.get("attackPower", 1)))))
                output.append(
                    "    gbs::IsoTacticalUnitData { "
                    f"{actor_index}, "
                    f"{0 if team == 'player' else 1}, "
                    f"static_cast<uint8_t>({move_range}), "
                    f"static_cast<uint8_t>({attack_range}), "
                    f"static_cast<uint8_t>({max_hp}), "
                    f"static_cast<uint8_t>({attack_power}) "
                    "},"
                )
            output.append("};")
            output.append("")
            active_team = tactical_config.get("active_team", tactical_config.get("activeTeam", "player"))
            if active_team not in ("player", "enemy"):
                raise SystemExit(f"isometric_project.rooms[{room_index}].tactical.active_team invalido")
            active_unit_index = max(0, min(len(tactical_units) - 1, int(tactical_config.get("active_unit_index", tactical_config.get("activeUnitIndex", 0)))))
            tactical_room_name = f"{prefix}_tactical"
            output.append(
                f"constexpr gbs::IsoTacticalRoomData {tactical_room_name} {{ "
                f"{tactical_unit_name}, {len(tactical_units)}, {active_unit_index}, {0 if active_team == 'player' else 1} "
                "};"
            )
            output.append("")
            tactical_expr = f"&{tactical_room_name}"
        room_video_literal = room_video_composition_literal(
            room,
            f"isometric_project.rooms[{room_index}]",
            asset_report,
        )
        room_entries.append(
            "    gbs::IsometricRoomData {\n"
            f"        {prefix}_visual_tiles,\n"
            f"        {prefix}_collision_flags,\n"
            f"        {width},\n"
            f"        {height},\n"
            f"        {actors_name},\n"
            f"        {len(actors)},\n"
            f"        {grid_expr},\n"
            f"        {camera_expr},\n"
            f"        {room_name},\n"
            f"        {on_enter_script},\n"
            f"        {on_exit_script},\n"
            f"        {on_update_script},\n"
            f"        {actor_interact_events_name},\n"
            f"        {actor_interact_event_count},\n"
            f"        {actor_start_events_name},\n"
            f"        {actor_start_event_count},\n"
            f"        {actor_update_events_name},\n"
            f"        {actor_update_event_count},\n"
            f"        {room_bank_group_literal},\n"
            f"        {tile_events_name},\n"
            f"        {tile_event_count},\n"
            f"        {cursor_start_expr},\n"
            f"        {'true' if cursor_start_enabled else 'false'},\n"
            f"        {triggers_name},\n"
            f"        {trigger_count},\n"
            f"        {background_layer_names['bg3']},\n"
            f"        {background_layer_names['bg2']},\n"
            f"        {background_layer_names['bg1']},\n"
            f"        {background_layer_names['bg0']},\n"
            f"        {tileset_tilemap_expr},\n"
            f"        {int(room.get('tileset_tile_width_pixels', 0))},\n"
            f"        {int(room.get('tileset_tile_height_pixels', 0))},\n"
            f"        {int(room.get('tileset_tile_offset_x_pixels', 0))},\n"
            f"        {int(room.get('tileset_tile_offset_y_pixels', 0))},\n"
            f"        {camera_zones_name},\n"
            f"        {camera_zone_count},\n"
            f"        {prefix}_height_levels,\n"
            f"        {actor_animations_name},\n"
            f"        {prefix}_ramp_flags,\n"
            f"        {tileset_tiles_expr},\n"
            f"        {authored_background_tilemap_expr},\n"
            f"        {int(room.get('tileset_render_width_pixels', 0))},\n"
            f"        {int(room.get('tileset_render_height_pixels', 0))},\n"
            f"        {world_mode_expr},\n"
            f"        {gameplay_mode_expr},\n"
            f"        {tactical_expr},\n"
            f"        {room_video_literal},\n"
            f"        {tactical_presentation_expr},\n"
            f"        gbs::IsoMovementModel::{'Tile' if movement_model == 'tile' else 'Free'},\n"
            f"        {int(room.get('tileset_render_offset_y_pixels', 0))},\n"
            f"        {emit_baked_isometric_reference(output, prefix, room, asset_report, output_dir, source_assets, base_dir)},\n"
            f"        {on_hit_group_scripts[0]},\n"
            f"        {on_hit_group_scripts[1]},\n"
            f"        {on_hit_group_scripts[2]}\n"
            "    }"
        )

    output.append("constexpr gbs::IsometricRoomData rooms[] = {")
    output.append(",\n".join(room_entries))
    output.append("};")
    output.append("")
    output.extend([
        "const gbs::IsometricProjectData project {",
        f"    {asset_refs['bg_palettes'][0]},",
        f"    {asset_refs['bg_palettes'][1]},",
        f"    {asset_refs['obj_palettes'][0]},",
        f"    {asset_refs['obj_palettes'][1]},",
        f"    {asset_refs['tile_assets'][0]},",
        f"    {asset_refs['tile_assets'][1]},",
        "    rooms,",
        f"    {len(rooms)},",
        f"    {initial_room},",
        f"    static_cast<uint16_t>({backdrop_color}),",
        f"    {resource_banks_name},",
        f"    {resource_bank_count},",
        f"    {resource_bank_groups_name},",
        f"    {resource_bank_group_count},",
        f"    {project_scripts_name},",
        f"    {project_script_count},",
        f"    {dialogue_lines_name},",
        f"    {dialogue_line_count},",
        f"    {asset_refs['sfx_assets'][0]},",
        f"    {asset_refs['sfx_assets'][1]},",
        f"    {asset_refs['music_assets'][0]},",
        f"    {asset_refs['music_assets'][1]},",
        f"    {asset_refs['pcm_assets'][0]},",
        f"    {asset_refs['pcm_assets'][1]},",
        f"    {asset_refs['tracker_assets'][0]},",
        f"    {asset_refs['tracker_assets'][1]},",
        f"    {video_literal}",
        "};",
        "",
        "} // namespace gbastudio_isometric_project",
        "",
    ])
    return "\n".join(output)


MIXED_RUNTIME_SCENE_COLLECTIONS = {
    "topdown": ("topdown_project", "rooms"),
    "platformer": ("platformer_project", "rooms"),
    "isometric": ("isometric_project", "rooms"),
    "menu": ("menu_project", "screens"),
    "shmup": ("shmup_project", "waves"),
    "point_click": ("point_click_project", "scenes"),
    "dungeon_crawler": ("dungeon_crawler_project", "rooms"),
    "racing": ("racing_project", "rooms"),
    "cutscene": ("cutscene_project", "scenes"),
    "visual_novel": ("visual_novel_project", "scenes"),
    "world_map": ("world_map_project", "nodes"),
    "battle_rpg": ("battle_rpg_project", "encounters"),
    "luta": ("luta_project", "stages"),
}

MIXED_RUNTIME_ENUMS = {
    "topdown": "gbs::RuntimeKind::TopDown",
    "platformer": "gbs::RuntimeKind::Platformer",
    "isometric": "gbs::RuntimeKind::Isometric",
    "menu": "gbs::RuntimeKind::Menu",
    "shmup": "gbs::RuntimeKind::Shmup",
    "point_click": "gbs::RuntimeKind::PointClick",
    "dungeon_crawler": "gbs::RuntimeKind::DungeonCrawler",
    "racing": "gbs::RuntimeKind::Racing",
    "cutscene": "gbs::RuntimeKind::Cutscene",
    "visual_novel": "gbs::RuntimeKind::VisualNovel",
    "world_map": "gbs::RuntimeKind::WorldMap",
    "battle_rpg": "gbs::RuntimeKind::BattleRpg",
    "luta": "gbs::RuntimeKind::Luta",
}


def mixed_runtime_scene_entries(project_data, normalized, runtime_dispatch):
    entries = []
    next_local_index = {runtime: 0 for runtime in normalized}
    project_collections = {}
    for runtime in normalized:
        project_key, collection_key = MIXED_RUNTIME_SCENE_COLLECTIONS[runtime]
        project = project_data.get(project_key)
        if not isinstance(project, dict):
            project_collections[runtime] = []
            continue
        collection = project.get(collection_key)
        if runtime == "menu" and collection is None:
            collection = project.get("menus")
        project_collections[runtime] = collection if isinstance(collection, list) else []

    scene_contracts = project_data.get("scene_contracts")
    if isinstance(scene_contracts, list) and scene_contracts:
        for scene_index, scene in enumerate(scene_contracts):
            if not isinstance(scene, dict):
                raise SystemExit(f"scene_contracts[{scene_index}] precisa ser objeto")
            runtime = normalize_runtime_profile(
                scene.get("runtime_profile", scene.get("scene_type")),
                f"scene_contracts[{scene_index}].runtime_profile",
            )
            if runtime not in normalized:
                raise SystemExit(
                    f"scene_contracts[{scene_index}] referencia runtime ausente em runtime_dispatch.runtimes: {runtime}"
                )
            name = scene.get("name", f"scene_{scene_index}")
            if not isinstance(name, str) or not name:
                raise SystemExit(f"scene_contracts[{scene_index}].name precisa ser string nao vazia")
            local_index = None
            for candidate_index, candidate in enumerate(project_collections[runtime]):
                candidate_name = candidate.get("name") if isinstance(candidate, dict) else None
                if candidate_name == name:
                    local_index = candidate_index
                    break
            if local_index is None:
                local_index = next_local_index[runtime]
            next_local_index[runtime] = max(next_local_index[runtime], local_index + 1)
            entries.append((name, runtime, local_index))
    else:
        for runtime in normalized:
            for local_index, scene in enumerate(project_collections[runtime]):
                name = scene.get("name", f"{runtime}_{local_index}") if isinstance(scene, dict) else f"{runtime}_{local_index}"
                if not isinstance(name, str) or not name:
                    name = f"{runtime}_{local_index}"
                entries.append((name, runtime, local_index))

    initial_runtime = normalize_runtime_profile(
        runtime_dispatch.get("initial_runtime", normalized[0]),
        "runtime_dispatch.initial_runtime",
    )
    initial_room = max(0, int(runtime_dispatch.get("initial_room", 0)))
    initial_scene_name = runtime_dispatch.get("initial_scene")
    has_initial_scene = any(
        runtime == initial_runtime and local_index == initial_room
        for _, runtime, local_index in entries
    )
    if not has_initial_scene:
        fallback_name = initial_scene_name if isinstance(initial_scene_name, str) and initial_scene_name else f"{initial_runtime}_{initial_room}"
        entries.append((fallback_name, initial_runtime, initial_room))
    return entries


def emit_mixed_project_data_header(project_data):
    if not isinstance(project_data, dict):
        raise SystemExit("project_data precisa ser objeto para kind mixed")
    runtime_dispatch = project_data.get("runtime_dispatch")
    if not isinstance(runtime_dispatch, dict):
        raise SystemExit("runtime_dispatch precisa ser objeto para kind mixed")
    runtimes = runtime_dispatch.get("runtimes", [])
    if not isinstance(runtimes, list) or not runtimes:
        raise SystemExit("runtime_dispatch.runtimes precisa ser lista nao vazia")
    normalized = [normalize_runtime_profile(runtime, "runtime_dispatch.runtimes[]") for runtime in runtimes]
    unsupported = [runtime for runtime in normalized if runtime not in ("topdown", "platformer", "isometric", "menu", "shmup", "point_click", "dungeon_crawler", "racing", "cutscene", "visual_novel", "world_map", "battle_rpg", "luta")]
    if unsupported:
        raise SystemExit(f"runtime_dispatch contem runtime ainda nao suportado no dispatcher: {unsupported[0]}")
    initial_runtime = normalize_runtime_profile(runtime_dispatch.get("initial_runtime", normalized[0]), "runtime_dispatch.initial_runtime")
    if initial_runtime not in normalized:
        raise SystemExit("runtime_dispatch.initial_runtime precisa estar presente em runtimes")
    initial_room = max(0, int(runtime_dispatch.get("initial_room", 0)))
    save = save_config_from_json(
        runtime_dispatch.get("save"),
        "runtime_dispatch.save",
        "GBUS",
        0,
        1024,
        3,
    )
    if isinstance(project_data.get("runtime_capabilities"), dict):
        save = dict(save)
        save["runtime_capabilities"] = project_data["runtime_capabilities"]
    runtime_enum = MIXED_RUNTIME_ENUMS[initial_runtime]
    scene_entries = mixed_runtime_scene_entries(project_data, normalized, runtime_dispatch)
    initial_scene = next(
        index
        for index, (_, runtime, local_index) in enumerate(scene_entries)
        if runtime == initial_runtime and local_index == initial_room
    )
    scene_registry = [
        f"    {{ {cpp_string_literal(name)}, {MIXED_RUNTIME_ENUMS[runtime]}, {local_index} }},"
        for name, runtime, local_index in scene_entries
    ]
    output = [
        "#pragma once",
        "",
        '#include "gbs/runtime.hpp"',
        '#include "gbs/save.hpp"',
        "",
        f"#define GBS_MIXED_HAS_TOPDOWN {1 if 'topdown' in normalized else 0}",
        f"#define GBS_MIXED_HAS_PLATFORMER {1 if 'platformer' in normalized else 0}",
        f"#define GBS_MIXED_HAS_ISOMETRIC {1 if 'isometric' in normalized else 0}",
        f"#define GBS_MIXED_HAS_MENU {1 if 'menu' in normalized else 0}",
        f"#define GBS_MIXED_HAS_SHMUP {1 if 'shmup' in normalized else 0}",
        f"#define GBS_MIXED_HAS_POINT_CLICK {1 if 'point_click' in normalized else 0}",
        f"#define GBS_MIXED_HAS_DUNGEON_CRAWLER {1 if 'dungeon_crawler' in normalized else 0}",
        f"#define GBS_MIXED_HAS_RACING {1 if 'racing' in normalized else 0}",
        f"#define GBS_MIXED_HAS_CUTSCENE {1 if 'cutscene' in normalized else 0}",
        f"#define GBS_MIXED_HAS_VISUAL_NOVEL {1 if 'visual_novel' in normalized else 0}",
        f"#define GBS_MIXED_HAS_WORLD_MAP {1 if 'world_map' in normalized else 0}",
        f"#define GBS_MIXED_HAS_BATTLE_RPG {1 if 'battle_rpg' in normalized else 0}",
        f"#define GBS_MIXED_HAS_LUTA {1 if 'luta' in normalized else 0}",
        "",
        "namespace gbastudio_mixed_project {",
        f"constexpr gbs::RuntimeKind initial_runtime = {runtime_enum};",
        f"constexpr int initial_room = {initial_room};",
        f"constexpr int initial_scene = {initial_scene};",
        "constexpr gbs::RuntimeSceneDescriptor runtime_scene_registry[] = {",
        *scene_registry,
        "};",
        "constexpr gbs::RuntimeSceneRegistry runtime_registry {",
        "    runtime_scene_registry,",
        "    sizeof(runtime_scene_registry) / sizeof(runtime_scene_registry[0]),",
        "    initial_scene",
        "};",
    ]
    emit_save_config(output, save)
    output.extend([
        "inline gbs::LinkSession runtime_link_session {};",
        "inline gbs::RuntimeLinkService runtime_link_service {",
        "    &runtime_link_session,",
        "    &runtime_capability_manifest",
        "};",
        "",
        "}",
        "",
    ])
    return "\n".join(output)


def emit_advanced_tools_data_header(advanced_tools):
    if not isinstance(advanced_tools, dict):
        raise SystemExit("advanced_tools precisa ser objeto quando informado")
    schema = int(advanced_tools.get("schema", 1))
    if schema != 1:
        raise SystemExit("advanced_tools.schema precisa ser 1")

    collection_keys = (
        "replays",
        "save_snapshots",
        "state_machines",
        "timelines",
        "effects",
        "particles",
        "fonts",
        "localization",
        "gameplay_components",
    )
    collections = {}
    for key in collection_keys:
        value = advanced_tools.get(key, [])
        if not isinstance(value, list):
            raise SystemExit(f"advanced_tools.{key} precisa ser lista")
        collections[key] = value

    compact_json = json.dumps(
        advanced_tools,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )
    json_literal = json.dumps(compact_json)
    return "\n".join([
        "#pragma once",
        "",
        "#include <cstddef>",
        "",
        "namespace gbastudio_advanced_tools {",
        f"constexpr int schema = {schema};",
        f"constexpr std::size_t replay_count = {len(collections['replays'])};",
        f"constexpr std::size_t save_snapshot_count = {len(collections['save_snapshots'])};",
        f"constexpr std::size_t state_machine_count = {len(collections['state_machines'])};",
        f"constexpr std::size_t timeline_count = {len(collections['timelines'])};",
        f"constexpr std::size_t effect_sequence_count = {len(collections['effects'])};",
        f"constexpr std::size_t particle_count = {len(collections['particles'])};",
        f"constexpr std::size_t font_count = {len(collections['fonts'])};",
        f"constexpr std::size_t localization_bundle_count = {len(collections['localization'])};",
        f"constexpr std::size_t gameplay_component_count = {len(collections['gameplay_components'])};",
        f"inline constexpr char contract_json[] __attribute__((used)) = {json_literal};",
        "constexpr std::size_t contract_json_size = sizeof(contract_json) - 1;",
        "}",
        "",
    ])


@background_cache_scope()
@obj_lookup_cache_scope()
def emit_export_project(project_data, base_dir, output_dir):
    if not isinstance(project_data, dict):
        raise SystemExit("export project json precisa ser objeto")
    backend = project_data.get("backend", "gbastudio_engine")
    if backend != "gbastudio_engine":
        raise SystemExit("backend precisa ser gbastudio_engine")

    contract = resolve_export_project_contract(project_data)
    template_dir = resolve_project_path(base_dir, project_data.get("template_dir", "."), "template_dir")
    previous_asset_report = None
    previous_asset_report_path = output_dir / "asset_pack_report.json"
    if previous_asset_report_path.exists():
        try:
            previous_asset_report = json.loads(previous_asset_report_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            previous_asset_report = None
    output_dir.mkdir(parents=True, exist_ok=True)
    copy_project_template_files(template_dir, output_dir)

    entry = project_data.get("entry", "main.cpp")
    project_header = project_data.get("project_data", "gbastudio_project_data.hpp")
    generated_assets = list(project_data.get("generated_assets", []))
    if not isinstance(generated_assets, list) or not all(isinstance(item, str) for item in generated_assets):
        raise SystemExit("generated_assets precisa ser lista de strings")
    build_config = project_data.get("build", {})
    if not isinstance(build_config, dict):
        raise SystemExit("build precisa ser objeto quando informado")

    dialogue_ui_box_skin, dialogue_ui_hud_skin, dialogue_ui_selector, dialogue_ui_font, dialogue_ui_config, dialogue_ui_hud_config, dialogue_ui_hud_presets, dialogue_ui_hud_scene_bindings, dialogue_ui_hud_layouts, dialogue_ui_active_hud_layout_id, dialogue_ui_scene_skins = shared_dialogue_ui_assets_from_project(
        project_data,
        base_dir,
    )
    dialogue_ui_assets_header = "dialogue_ui_assets.hpp"
    generated_assets.append(dialogue_ui_assets_header)

    advanced_tools = project_data.get("advanced_tools")
    if advanced_tools is not None:
        advanced_tools_header = "advanced_tools_project_data.hpp"
        generated_assets.append(advanced_tools_header)
        write_text_if_changed(output_dir / advanced_tools_header,
            emit_advanced_tools_data_header(advanced_tools),
            encoding="utf-8",
        )

    asset_pack = project_data.get("asset_pack")
    asset_report = None
    if asset_pack is not None:
        asset_report = emit_pack_report(asset_pack, base_dir, previous_asset_report)
        write_text_if_changed(output_dir / "asset_pack_report.json",
            json.dumps(asset_report, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        if not asset_report["ok"]:
            return asset_report, False

        assets = asset_pack.get("assets", [])
        allocations = asset_report.get("allocations", [])
        for asset, header, allocation in zip(assets, asset_report["export_plan"]["headers"], allocations):
            header_name = header["header"]
            missing_generated_header = (
                not allocation.get("omitted", False)
                and (header.get("inputs") or asset.get("kind") == "palette")
                and not (output_dir / header_name).exists()
            )
            if header.get("generate", True) or missing_generated_header:
                generated_assets.append(header_name)
                header_output = emit_asset_header_from_pack_entry(asset, base_dir, header["symbol"], allocation)
                write_text_if_changed(output_dir / header_name,header_output, encoding="utf-8")
            elif bool(header.get("inputs", [])):
                generated_assets.append(header_name)

    write_text_if_changed(output_dir / dialogue_ui_assets_header,
        emit_shared_dialogue_ui_assets_header(
            dialogue_ui_box_skin,
            dialogue_ui_hud_skin,
            dialogue_ui_selector,
            dialogue_ui_font,
            dialogue_ui_config,
            dialogue_ui_hud_config,
            dialogue_ui_hud_presets,
            dialogue_ui_hud_scene_bindings,
            dialogue_ui_hud_layouts,
            dialogue_ui_active_hud_layout_id,
            asset_report,
            scene_skins=dialogue_ui_scene_skins,
        ),
        encoding="utf-8",
    )

    generated_asset_includes = sorted(dict.fromkeys(generated_assets))

    def project_with_generated_asset_includes(project, include_all_pack_assets=True):
        if not isinstance(project, dict):
            return project
        includes = project.get("includes", [])
        if includes is None:
            includes = []
        if not isinstance(includes, list) or not all(isinstance(item, str) for item in includes):
            return project
        merged = dict(project)
        selected_includes = project_generated_asset_includes(
            project, generated_asset_includes, asset_report, include_all_pack_assets,
        )
        merged["includes"] = merge_includes(includes, selected_includes)
        return merged

    is_mixed_runtime = contract["base_runtime"] == "mixed"
    runtime_dispatch = project_data.get("runtime_dispatch") if is_mixed_runtime else None
    mixed_save_config = runtime_dispatch.get("save") if isinstance(runtime_dispatch, dict) else None
    runtime_capabilities = project_data.get("runtime_capabilities")

    def project_with_mixed_save_config(project):
        if not isinstance(project, dict):
            return project
        merged = dict(project)
        if is_mixed_runtime and isinstance(mixed_save_config, dict):
            merged["save"] = dict(mixed_save_config)
        if isinstance(runtime_capabilities, dict):
            save = dict(merged.get("save")) if isinstance(merged.get("save"), dict) else {}
            save["runtime_capabilities"] = runtime_capabilities
            merged["save"] = save
        return merged

    topdown_project = contract["project"] if contract["base_runtime"] == "topdown" else project_data.get("topdown_project")
    if topdown_project is not None and (contract["base_runtime"] == "topdown" or is_mixed_runtime):
        topdown_project = project_with_generated_asset_includes(topdown_project)
        topdown_project = project_with_mixed_save_config(topdown_project)
        topdown_header = "topdown_project_data.hpp" if is_mixed_runtime else project_header
        write_text_if_changed(output_dir / topdown_header,
            emit_topdown_project_data_header(topdown_project, asset_report, base_dir),
            encoding="utf-8",
        )

    platformer_project = contract["project"] if contract["base_runtime"] == "platformer" else project_data.get("platformer_project")
    if platformer_project is not None and (contract["base_runtime"] == "platformer" or is_mixed_runtime):
        platformer_project = project_with_generated_asset_includes(platformer_project)
        platformer_project = project_with_mixed_save_config(platformer_project)
        platformer_header = "platformer_project_data.hpp" if is_mixed_runtime else project_header
        write_text_if_changed(output_dir / platformer_header,
            emit_platformer_project_data_header(platformer_project, asset_report, base_dir),
            encoding="utf-8",
        )

    isometric_project = contract["project"] if contract["base_runtime"] == "isometric" else project_data.get("isometric_project")
    if isometric_project is not None and (contract["base_runtime"] == "isometric" or is_mixed_runtime):
        isometric_project = project_with_generated_asset_includes(isometric_project)
        isometric_project = project_with_mixed_save_config(isometric_project)
        isometric_header = "isometric_project_data.hpp" if is_mixed_runtime else project_header
        write_text_if_changed(output_dir / isometric_header,
            emit_isometric_project_data_header(isometric_project, asset_report, base_dir, output_dir, project_data.get('asset_pack', {}).get('assets', [])),
            encoding="utf-8",
        )

    dungeon_crawler_project = contract["project"] if contract["base_runtime"] == "dungeon_crawler" else project_data.get("dungeon_crawler_project")
    if dungeon_crawler_project is not None and (contract["base_runtime"] == "dungeon_crawler" or is_mixed_runtime):
        dungeon_crawler_project = project_with_generated_asset_includes(dungeon_crawler_project)
        dungeon_crawler_project = project_with_mixed_save_config(dungeon_crawler_project)
        dungeon_crawler_header = "dungeon_crawler_project_data.hpp" if is_mixed_runtime else project_header
        write_text_if_changed(output_dir / dungeon_crawler_header,
            emit_dungeon_crawler_project_data_header(dungeon_crawler_project, asset_report),
            encoding="utf-8",
        )

    racing_project = contract["project"] if contract["base_runtime"] == "racing" else project_data.get("racing_project")
    if racing_project is not None and (contract["base_runtime"] == "racing" or is_mixed_runtime):
        racing_project = project_with_generated_asset_includes(racing_project, include_all_pack_assets=False)
        racing_project = project_with_mixed_save_config(racing_project)
        racing_header = "racing_project_data.hpp" if is_mixed_runtime else project_header
        write_text_if_changed(output_dir / racing_header,
            emit_racing_project_data_header(racing_project, asset_report, base_dir),
            encoding="utf-8",
        )

    battle_rpg_project = contract["project"] if contract["base_runtime"] == "battle_rpg" else project_data.get("battle_rpg_project")
    if battle_rpg_project is not None and (contract["base_runtime"] == "battle_rpg" or is_mixed_runtime):
        battle_rpg_project = project_with_generated_asset_includes(battle_rpg_project)
        battle_rpg_project = project_with_mixed_save_config(battle_rpg_project)
        battle_rpg_header = "battle_rpg_project_data.hpp" if is_mixed_runtime else project_header
        write_text_if_changed(output_dir / battle_rpg_header,
            emit_battle_rpg_project_data_header(battle_rpg_project, asset_report),
            encoding="utf-8",
        )

    luta_project = contract["project"] if contract["base_runtime"] == "luta" else project_data.get("luta_project")
    if luta_project is not None and (contract["base_runtime"] == "luta" or is_mixed_runtime):
        luta_project = project_with_generated_asset_includes(luta_project)
        luta_project = project_with_mixed_save_config(luta_project)
        luta_header = "luta_project_data.hpp" if is_mixed_runtime else project_header
        write_text_if_changed(output_dir / luta_header,
            emit_luta_project_data_header(luta_project, asset_report, base_dir),
            encoding="utf-8",
        )

    if is_mixed_runtime:
        write_text_if_changed(output_dir / project_header,
            emit_mixed_project_data_header(project_data),
            encoding="utf-8",
        )

    visual_novel_project = contract["project"] if contract["base_runtime"] == "visual_novel" else project_data.get("visual_novel_project")
    if visual_novel_project is not None and (contract["base_runtime"] == "visual_novel" or is_mixed_runtime):
        visual_novel_project = project_with_generated_asset_includes(visual_novel_project)
        visual_novel_project = project_with_mixed_save_config(visual_novel_project)
        visual_novel_header = "visual_novel_project_data.hpp" if is_mixed_runtime else project_header
        write_text_if_changed(output_dir / visual_novel_header,
            emit_visual_novel_project_data_header(visual_novel_project, asset_report),
            encoding="utf-8",
        )

    point_click_project = contract["project"] if contract["base_runtime"] == "point_click" else project_data.get("point_click_project")
    if point_click_project is not None and (contract["base_runtime"] == "point_click" or is_mixed_runtime):
        point_click_project = project_with_generated_asset_includes(point_click_project)
        point_click_project = project_with_mixed_save_config(point_click_project)
        point_click_header = "point_click_project_data.hpp" if is_mixed_runtime else project_header
        write_text_if_changed(output_dir / point_click_header,
            emit_point_click_project_data_header(point_click_project, asset_report, base_dir),
            encoding="utf-8",
        )

    shmup_project = contract["project"] if contract["base_runtime"] == "shmup" else project_data.get("shmup_project")
    if shmup_project is not None and (contract["base_runtime"] == "shmup" or is_mixed_runtime):
        shmup_project = project_with_generated_asset_includes(shmup_project)
        shmup_project = project_with_mixed_save_config(shmup_project)
        shmup_header = "shmup_project_data.hpp" if is_mixed_runtime else project_header
        write_text_if_changed(output_dir / shmup_header,
            emit_shmup_project_data_header(shmup_project, asset_report, base_dir),
            encoding="utf-8",
        )

    menu_project = contract["project"] if contract["base_runtime"] == "menu" else project_data.get("menu_project")
    if menu_project is not None and (contract["base_runtime"] == "menu" or is_mixed_runtime):
        menu_project = project_with_generated_asset_includes(menu_project, include_all_pack_assets=False)
        menu_project = project_with_mixed_save_config(menu_project)
        menu_header = "menu_project_data.hpp" if is_mixed_runtime else project_header
        write_text_if_changed(output_dir / menu_header,
            emit_menu_project_data_header(menu_project, asset_report),
            encoding="utf-8",
        )

    cutscene_project = contract["project"] if contract["base_runtime"] == "cutscene" else project_data.get("cutscene_project")
    if cutscene_project is not None and (contract["base_runtime"] == "cutscene" or is_mixed_runtime):
        cutscene_project = project_with_generated_asset_includes(cutscene_project)
        cutscene_project = project_with_mixed_save_config(cutscene_project)
        cutscene_header = "cutscene_project_data.hpp" if is_mixed_runtime else project_header
        write_text_if_changed(output_dir / cutscene_header,
            emit_cutscene_project_data_header(cutscene_project, asset_report),
            encoding="utf-8",
        )

    world_map_project = contract["project"] if contract["base_runtime"] == "world_map" else project_data.get("world_map_project")
    if world_map_project is not None and (contract["base_runtime"] == "world_map" or is_mixed_runtime):
        world_map_project = project_with_generated_asset_includes(world_map_project, include_all_pack_assets=False)
        world_map_project = project_with_mixed_save_config(world_map_project)
        world_map_header = "world_map_project_data.hpp" if is_mixed_runtime else project_header
        write_text_if_changed(output_dir / world_map_header,
            emit_world_map_project_data_header(world_map_project, asset_report),
            encoding="utf-8",
        )

    if contract["project"] is None:
        raise SystemExit(f"{contract['block']} precisa ser informado para kind {contract['profile']}")

    selected_save = mixed_save_config if is_mixed_runtime else contract["project"].get("save")
    selected_save_type = (selected_save or {}).get("save_type", "sram") if isinstance(selected_save, dict) else "sram"
    if selected_save_type == "flash1m":
        write_text_if_changed(output_dir / "save_type.cpp",
            'extern "C" __attribute__((used, section(".gbs.save_signature"))) '
            'const char gbs_save_type_signature[] = "FLASH1M_V103";\n',
            encoding="utf-8",
        )
        build_config = dict(build_config)
        sources = build_config.get("sources", [])
        if not isinstance(sources, list) or not all(isinstance(item, str) for item in sources):
            raise SystemExit("build.sources precisa ser lista de strings")
        if not sources:
            sources = ["main.cpp"]
        build_config["sources"] = list(dict.fromkeys([*sources, "save_type.cpp"]))
    elif selected_save_type != "sram":
        raise SystemExit("save_type precisa ser sram ou flash1m")

    manifest = {
        "schema": int(project_data.get("schema", 1)),
        "backend": backend,
        "kind": contract["kind"],
        "runtime_profile": contract["profile"],
        "runtime_adapter": {
            "base_runtime": contract["base_runtime"],
            "adapter": contract["adapter"],
            "project_block": contract["block"],
            "native": contract["adapter"] == "native",
        },
        "entry": entry,
        "project_data": project_header,
        "generated_assets": sorted(dict.fromkeys(generated_assets)),
        "requires": project_data.get("requires", {}),
    }
    if build_config:
        manifest["build"] = build_config
    if asset_report is not None:
        manifest["asset_pack_report"] = "asset_pack_report.json"
        manifest["asset_count"] = asset_report["asset_count"]
    write_text_if_changed(output_dir / "gbastudio_project.json",
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return asset_report, True


def main():
    parser = argparse.ArgumentParser(description="GBAStudio Engine asset compiler")
    parser.add_argument("input", nargs="?")
    parser.add_argument("-o", "--output")
    parser.add_argument("-n", "--name", default="asset")
    parser.add_argument("--destination-tile", type=int, default=0)
    parser.add_argument("--palette-bank", type=int, default=0)
    parser.add_argument("--object-tiles", action="store_true")
    parser.add_argument("--sprite-width", type=int)
    parser.add_argument("--sprite-height", type=int)
    parser.add_argument("--sprite-bpp", type=int, choices=(4, 8), default=4)
    parser.add_argument("--stream-frames", action="store_true")
    parser.add_argument("--frame-duration", type=int, default=8)
    parser.add_argument("--bitmap-mode", type=int, choices=(3, 4, 5))
    parser.add_argument("--affine-tilemap", action="store_true")
    parser.add_argument("--indexed-tilemap", action="store_true")
    parser.add_argument("--paged-tilemap", action="store_true")
    parser.add_argument("--background-bpp", type=int, choices=(4, 8), default=4)
    parser.add_argument("--prepare-background-4bpp", action="store_true")
    parser.add_argument("--background-report")
    parser.add_argument("--optimize-background-tiles", action="store_true")
    parser.add_argument("--background-tile-budget", type=int, default=1024)
    parser.add_argument("--background-tile-report")
    parser.add_argument("--background-palette-banks", type=int, default=16)
    parser.add_argument("--background-palette-reference")
    parser.add_argument("--rle-tilemap", action="store_true")
    parser.add_argument("--lz77-tilemap", action="store_true")
    parser.add_argument("--lz77-tiles", action="store_true")
    parser.add_argument("--lz77-palette", action="store_true")
    parser.add_argument("--huffman-tilemap", action="store_true")
    parser.add_argument("--huffman-tiles", action="store_true")
    parser.add_argument("--huffman-palette", action="store_true")
    parser.add_argument("--collision-color-index", type=int)
    parser.add_argument("--slope-color-indexes")
    parser.add_argument("--audio-json", action="store_true")
    parser.add_argument("--pack-json", action="store_true")
    parser.add_argument("--export-project-json", action="store_true")
    parser.add_argument("--previous-pack-report")
    parser.add_argument("--version", action="store_true")
    args = parser.parse_args()
    if args.paged_tilemap:
        if args.indexed_tilemap:
            parser.error("--paged-tilemap e --indexed-tilemap sao consumidores distintos")
        args.indexed_tilemap = True

    if args.version:
        print("assetc 2.25.0")
        return 0

    if not args.input or not args.output:
        parser.error("informe input e --output")
    if not 1 <= args.background_palette_banks <= 16:
        parser.error("--background-palette-banks precisa estar entre 1 e 16")

    if args.prepare_background_4bpp:
        if args.background_report is None:
            parser.error("--prepare-background-4bpp precisa de --background-report")
        if args.background_bpp != 4:
            parser.error("--prepare-background-4bpp usa apenas background 4bpp")
        if (
            args.object_tiles
            or args.sprite_width is not None
            or args.sprite_height is not None
            or args.stream_frames
            or args.bitmap_mode is not None
            or args.affine_tilemap
            or args.indexed_tilemap
            or args.rle_tilemap
            or args.lz77_tilemap
            or args.lz77_tiles
            or args.lz77_palette
            or args.huffman_tilemap
            or args.huffman_tiles
            or args.huffman_palette
            or args.collision_color_index is not None
            or args.slope_color_indexes is not None
            or args.audio_json
            or args.pack_json
            or args.export_project_json
            or args.optimize_background_tiles
            or args.background_tile_report is not None
        ):
            parser.error("--prepare-background-4bpp nao pode ser combinado com outro modo de compilacao")
        width, height, colors, indices, transparent_index = read_png(
            args.input, max_colors=None, include_transparency=True
        )
        plan = prepare_4bpp_background(
            width,
            height,
            colors,
            indices,
            max_palette_banks=args.background_palette_banks,
            transparent_index=transparent_index,
            reference_plan=(
                background_palette_plan_from_path(args.background_palette_reference, args.background_palette_banks)
                if args.background_palette_reference else None
            ),
        )
        write_rgba_png(args.output, width, height, plan["prepared_pixels"])
        Path(args.background_report).write_text(
            json.dumps(background_preparation_report(width, height, plan), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        return 0

    if args.background_report is not None:
        parser.error("--background-report so pode ser usado com --prepare-background-4bpp")
    if args.background_tile_report is not None and not args.optimize_background_tiles:
        parser.error("--background-tile-report precisa de --optimize-background-tiles")
    if args.optimize_background_tiles and not 1 <= args.background_tile_budget <= 1024:
        parser.error("--background-tile-budget precisa estar entre 1 e 1024")

    if args.audio_json or args.pack_json or args.export_project_json:
        enabled_json_modes = sum(1 for value in (args.audio_json, args.pack_json, args.export_project_json) if value)
        if enabled_json_modes > 1:
            parser.error("--audio-json, --pack-json e --export-project-json nao podem ser usados juntos")
        if args.previous_pack_report and not args.pack_json:
            parser.error("--previous-pack-report so pode ser usado com --pack-json")
        if args.sprite_width is not None or args.sprite_bpp != 4 or args.bitmap_mode is not None or args.affine_tilemap or args.rle_tilemap or args.lz77_tilemap or args.lz77_tiles or args.lz77_palette or args.huffman_tilemap or args.huffman_tiles or args.huffman_palette or args.stream_frames or args.collision_color_index is not None or args.slope_color_indexes is not None or args.optimize_background_tiles or args.background_palette_banks != 16:
            parser.error("--audio-json/--pack-json/--export-project-json nao pode ser combinado com opcoes de imagem")
        input_path = Path(args.input)
        input_data = json.loads(input_path.read_text(encoding="utf-8"))
        if args.audio_json:
            output = emit_audio_header(args.name, input_data, input_path.parent)
            Path(args.output).write_text(output, encoding="utf-8")
        elif args.export_project_json:
            _, ok = emit_export_project(input_data, input_path.parent, Path(args.output))
            if not ok:
                return 1
        else:
            previous_report = None
            if args.previous_pack_report:
                previous_path = Path(args.previous_pack_report)
                previous_report = json.loads(previous_path.read_text(encoding="utf-8"))
            report = emit_pack_report(input_data, input_path.parent, previous_report)
            Path(args.output).write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
            if not report["ok"]:
                return 1
        return 0

    if (args.sprite_width is None) != (args.sprite_height is None):
        parser.error("--sprite-width e --sprite-height devem ser usados juntos")
    if args.sprite_bpp != 4 and args.sprite_width is None:
        parser.error("--sprite-bpp exige --sprite-width e --sprite-height")
    if args.bitmap_mode is not None and args.sprite_width is not None:
        parser.error("--bitmap-mode nao pode ser combinado com spritesheets")
    if args.background_bpp == 8 and not (args.affine_tilemap or args.indexed_tilemap):
        parser.error("--background-bpp 8 exige --affine-tilemap ou --indexed-tilemap")
    if args.optimize_background_tiles and (
        args.background_bpp != 4
        or args.object_tiles
        or args.sprite_width is not None
        or args.affine_tilemap
        or args.indexed_tilemap
        or args.bitmap_mode is not None
    ):
        parser.error("--optimize-background-tiles so pode ser usado com background regular 4bpp")
    if args.background_palette_banks != 16 and (
        args.background_bpp != 4
        or args.object_tiles
        or args.sprite_width is not None
        or args.affine_tilemap
        or args.indexed_tilemap
        or args.bitmap_mode is not None
    ):
        parser.error("--background-palette-banks so pode ser usado com background regular 4bpp")
    if args.bitmap_mode in (3, 5) and (args.lz77_palette or args.huffman_palette):
        parser.error("compressao de paleta so pode ser usada com imagens que geram PaletteAsset")
    if args.affine_tilemap and args.sprite_width is not None:
        parser.error("--affine-tilemap nao pode ser combinado com spritesheets")
    if args.affine_tilemap and args.bitmap_mode is not None:
        parser.error("--affine-tilemap nao pode ser combinado com --bitmap-mode")
    if args.bitmap_mode is not None and (args.rle_tilemap or args.lz77_tilemap or args.lz77_tiles or args.huffman_tilemap or args.huffman_tiles or args.collision_color_index is not None or args.slope_color_indexes is not None or args.object_tiles):
        parser.error("--bitmap-mode nao pode ser combinado com opcoes de tilemap")
    if args.affine_tilemap and (args.rle_tilemap or args.lz77_tilemap or args.lz77_tiles or args.huffman_tilemap or args.huffman_tiles or args.collision_color_index is not None or args.slope_color_indexes is not None or args.object_tiles or args.palette_bank != 0):
        parser.error("--affine-tilemap nao pode ser combinado com opcoes de tilemap 4bpp, object tiles ou palette bank")
    if args.indexed_tilemap and (args.sprite_width is not None or args.bitmap_mode is not None or args.affine_tilemap or args.rle_tilemap or args.lz77_tilemap or args.lz77_tiles or args.lz77_palette or args.huffman_tilemap or args.huffman_tiles or args.huffman_palette or args.collision_color_index is not None or args.slope_color_indexes is not None or args.object_tiles or args.palette_bank != 0 or args.destination_tile != 0):
        parser.error("--indexed-tilemap nao pode ser combinado com opcoes de tilemap 4bpp, compressao, object tiles, palette bank ou destino")
    if args.sprite_width is not None and args.rle_tilemap:
        parser.error("--rle-tilemap so pode ser usado com tilemaps, nao spritesheets")
    if args.sprite_width is not None and (args.lz77_tilemap or args.huffman_tilemap):
        parser.error("compressao de tilemap so pode ser usada com tilemaps, nao spritesheets")
    if args.sprite_width is not None and (args.lz77_tiles or args.huffman_tiles):
        parser.error("--lz77-tiles so pode ser usado com tilemaps 4bpp, nao spritesheets")
    if args.stream_frames and args.sprite_width is None:
        parser.error("--stream-frames exige --sprite-width e --sprite-height")
    if args.sprite_width is not None and args.collision_color_index is not None:
        parser.error("--collision-color-index so pode ser usado com tilemaps, nao spritesheets")
    if args.sprite_width is not None and args.slope_color_indexes is not None:
        parser.error("--slope-color-indexes so pode ser usado com tilemaps, nao spritesheets")
    max_colors = 16
    if args.bitmap_mode == 4:
        max_colors = 256
    elif args.bitmap_mode in (3, 5):
        max_colors = 240 * 160
    elif args.affine_tilemap or args.indexed_tilemap:
        max_colors = 224 if args.paged_tilemap else 256
    elif args.sprite_bpp == 8:
        max_colors = 256
    elif not args.object_tiles and args.sprite_width is None:
        max_colors = 256
    width, height, colors, indices, transparent_index = read_png(
        args.input,
        max_colors=max_colors,
        include_transparency=True,
    )
    slope_color_indexes = parse_slope_color_indexes(args.slope_color_indexes)
    if args.bitmap_mode is not None:
        output = emit_bitmap_header(
            args.name,
            width,
            height,
            colors,
            indices,
            args.bitmap_mode,
            args.palette_bank,
            args.lz77_palette,
            args.huffman_palette,
        )
    elif args.affine_tilemap:
        output = emit_affine_header(
            args.name,
            width,
            height,
            colors,
            indices,
            args.destination_tile,
            args.lz77_palette,
            huffman_palette=args.huffman_palette,
        )
    elif args.indexed_tilemap:
        output = emit_indexed_background_header(
            args.name,
            width,
            height,
            colors,
            indices,
            max_source_tiles=65535 if args.paged_tilemap else 1024,
        )
    elif args.sprite_width is not None:
        output = emit_sprite_header(
            args.name,
            width,
            height,
            colors,
            indices,
            args.destination_tile,
            args.palette_bank,
            args.sprite_width,
            args.sprite_height,
            args.frame_duration,
            args.lz77_palette,
            args.stream_frames,
            args.sprite_bpp,
            args.huffman_palette,
        )
    else:
        tile_optimization = {} if args.optimize_background_tiles else None
        reference_plan = (
            background_palette_plan_from_path(args.background_palette_reference, args.background_palette_banks)
            if args.background_palette_reference else None
        )
        output = emit_header(
            args.name,
            width,
            height,
            colors,
            indices,
            args.destination_tile,
            args.palette_bank,
            args.object_tiles,
            args.rle_tilemap,
            args.lz77_tilemap,
            args.lz77_tiles,
            args.lz77_palette,
            args.collision_color_index,
            slope_color_indexes,
            args.background_bpp,
            transparent_index,
            args.background_tile_budget if args.optimize_background_tiles else None,
            tile_optimization,
            args.background_palette_banks,
            reference_plan,
            args.huffman_tilemap,
            args.huffman_tiles,
            args.huffman_palette,
        )
        if args.background_tile_report is not None:
            tile_optimization.update({
                "schema_version": 1,
                "runtime_bpp": 4,
                "optimization_enabled": True,
            })
            Path(args.background_tile_report).write_text(
                json.dumps(tile_optimization, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
    Path(args.output).write_text(
        output,
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
