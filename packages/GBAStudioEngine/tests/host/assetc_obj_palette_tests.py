#!/usr/bin/env python3
"""Mixed OBJ palettes must remain exact and leave runtime text banks untouched."""
import tempfile
from pathlib import Path
from assetc_production_contract_tests import load_assetc_module, write_indexed_png


def asset(name, bpp, group="room"):
    return {"id": name, "name": name, "kind": "obj", "png": name + ".png",
            "sprite_width": 8, "sprite_height": 8, "sprite_bpp": bpp,
            "transparent_color_index": 0, "stream_frames": True, "bank_group": group}


def test_mixed_palette_is_exact_shared_even_and_preserves_text():
    c = load_assetc_module()
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        colors = [(0, 0, 0)] + [(i * 8, 64, 128) for i in range(1, 26)]
        write_indexed_png(root / "hero.png", 8, 8, colors, [1 + i % 25 for i in range(64)])
        write_indexed_png(root / "npc.png", 8, 8, [(0, 0, 0), colors[5], (240, 200, 16)], [1, 2] * 32)
        entries = [asset("npc", 4), asset("hero", 8)]
        report = c.emit_pack_report({"assets": entries}, root)
        assert report["ok"], report["errors"]
        allocations = {a["id"]: a for a in report["allocations"]}
        assert allocations["hero"]["allocations"]["obj_tiles"]["start"] % 2 == 0
        master = allocations["hero"]["object_palette_plan"]["values"]
        assert len(master) == 208  # banks 13-15 stay owned by runtime text/UI
        assert master[192:196] == [0, c.rgb15((48, 160, 248)), c.rgb15((248, 56, 40)), c.rgb15((248, 248, 248))]
        npc = allocations["npc"]["object_palette_plan"]
        bank = npc["palette_bank"]
        assert master[bank * 16:bank * 16 + 16] == npc["values"]
        resolved = c.pack_asset_with_allocations(entries[1], allocations["hero"])
        _, _, src, indices, transparent = c.read_png(root / "hero.png", max_colors=256, include_transparency=True)
        target, remapped = c.prepare_obj_asset_pixels(src, indices, transparent, resolved)
        assert [c.rgb15(target[i]) for i in remapped] == [c.rgb15(src[i]) for i in indices]
        header = c.emit_asset_header_from_pack_entry(entries[1], root, "hero", allocations["hero"])
        assert "hero_palette_asset = { hero_palette, 208, 0 }" in header
        assert "gbs::ColorDepth::Bpp8" in header
        assert "hero_tiles[1][64]" in header
        palette_banks = [b for b in report["resource_bank_plan"] if b["resource"] == "obj_palette_colors"]
        used = set()
        for b in palette_banks:
            span = set(range(b["start"], b["start"] + b["count"]))
            assert not used.intersection(span), "runtime palette bank reservations must not overlap"
            used.update(span)
        assert used == set(range(208)), "the shared palette must actually have upload banks"
        unchanged = c.emit_pack_report({"assets": entries}, root, report)
        assert next(a for a in unchanged["allocations"] if a["id"] == "hero")["resource_cache"] == "reused"
        # Palette changes elsewhere in the same scope must rebuild all dependants.
        write_indexed_png(root / "npc.png", 8, 8, [(0, 0, 0), (0, 200, 16)], [1] * 64)
        next_report = c.emit_pack_report({"assets": entries}, root, report)
        assert next(a for a in next_report["allocations"] if a["id"] == "hero")["status"] == "changed"


def test_disjoint_scenes_do_not_spend_each_others_palette():
    c = load_assetc_module()
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for name, offset in [("a", 0), ("b", 12)]:
            colors = [(0, 0, 0)] + [((i % 32) * 8, (i // 32 + offset) * 8, 64) for i in range(1, 161)]
            write_indexed_png(root / (name + ".png"), 16, 16, colors, [1 + i % 160 for i in range(256)])
        assert c.emit_pack_report({"assets": [asset("a", 8, "a"), asset("b", 8, "b")]}, root)["ok"]
        write_indexed_png(root / "shared.png", 8, 8, [(0, 0, 0), (248, 0, 0)], [1] * 64)
        report = c.emit_pack_report({"assets": [asset("shared", 4, "global"), asset("a", 8, "a"), asset("b", 8, "b")]}, root)
        assert report["ok"], "a global 4bpp effect must not merge disjoint 8bpp scene palettes"
        write_indexed_png(root / "icon.png", 8, 8, [(0, 0, 0), (248, 248, 0)], [1] * 64)
        report = c.emit_pack_report({"assets": [asset("shared", 4, "global"), asset("icon", 4, "a"), asset("a", 8, "a"), asset("b", 8, "b")]}, root)
        for group in ["a", "b"]:
            used = set()
            for bank in report["resource_bank_plan"]:
                if bank["resource"] != "obj_palette_colors" or not ({group, "global"}.intersection(bank["groups"])):
                    continue
                span = set(range(bank["start"], bank["start"] + bank["count"]))
                assert not used.intersection(span), "a global and a scoped palette must share one runtime bank identity"
                used.update(span)


def test_shared_palette_overflow_blocks_without_quantizing():
    c = load_assetc_module()
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        colors = [(0, 0, 0)] + [((i % 32) * 8, (i // 32) * 8, 64) for i in range(1, 220)]
        write_indexed_png(root / "hero.png", 16, 16, colors, [1 + i % 219 for i in range(256)])
        try:
            c.emit_pack_report({"assets": [asset("hero", 8)]}, root)
        except SystemExit as error:
            assert "paleta OBJ compartilhada" in str(error) and "207" in str(error), str(error)
        else:
            raise AssertionError("palette overflow was accepted")


def test_mixed_palette_rejects_conflicting_fixed_placements():
    c = load_assetc_module()
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        write_indexed_png(root / "hero.png", 8, 8, [(0, 0, 0), (248, 0, 0)], [1] * 64)
        entry = asset("hero", 8)
        entry["placement"] = {"obj_palette_colors": {"start": 16}}
        try:
            c.emit_pack_report({"assets": [entry]}, root)
        except SystemExit as error:
            assert "paleta OBJ compartilhada" in str(error)
        else:
            raise AssertionError("fixed palette placement was silently ignored")


def test_four_bpp_icons_share_a_bank_when_their_color_union_fits():
    c = load_assetc_module()
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        entries = [asset("hero", 8)]
        write_indexed_png(root / "hero.png", 8, 8, [(0, 0, 0), (248, 0, 0)], [1] * 64)
        for i in range(14):
            name = "icon" + str(i)
            write_indexed_png(root / (name + ".png"), 8, 8, [(0, 0, 0), (i * 8, 64, 128)], [1] * 64)
            entries.append(asset(name, 4))
        report = c.emit_pack_report({"assets": entries}, root)
        assert report["ok"]
        assert len({a["object_palette_plan"]["palette_bank"] for a in report["allocations"] if a["id"].startswith("icon")}) == 1


def test_eight_bpp_rgba_uses_exact_hardware_colors_without_quantization():
    c = load_assetc_module()
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        pixels = [((i % 32) * 8 + (i // 32) % 8, 64 + i // 256, 128, 255) for i in range(512)]
        c.write_rgba_png(root / "hero.png", 32, 16, pixels)
        def reject_quantization(*args):
            raise AssertionError("8bpp authoring must not invoke the color-reduction quantizer")
        c.quantize_color_counts = reject_quantization
        source = asset("hero", 8)
        source.pop("transparent_color_index")  # every RGBA pixel in this fixture is opaque
        report = c.emit_pack_report({"assets": [source]}, root)
        assert report["ok"], report["errors"]
        entry = report["allocations"][0]
        header = c.emit_asset_header_from_pack_entry(source, root, "hero", entry)
        assert "gbs::ColorDepth::Bpp8" in header
        resolved = c.pack_asset_with_allocations(source, entry)
        _, _, colors, indices, transparent = c.read_png(root / "hero.png", max_colors=None, include_transparency=True)
        target, remapped = c.prepare_obj_asset_pixels(colors, indices, transparent, resolved)
        assert [c.rgb15(target[i]) for i in remapped] == [c.rgb15(p[:3]) for p in pixels]


def test_extra_obj_resource_cannot_allocate_private_text_banks():
    c = load_assetc_module()
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        write_indexed_png(root / "hero.png", 8, 8, [(0, 0, 0), (248, 0, 0)], [1] * 64)
        extra = {"id": "extra", "name": "extra", "resources": {"obj_palette_colors": 16}, "bank_group": "room"}
        report = c.emit_pack_report({"assets": [asset("hero", 8), extra]}, root)
        assert not report["ok"], "an extra OBJ palette resource must not occupy reserved text banks 13-15"


def test_palette_families_remain_compile_time_tables():
    c = load_assetc_module()
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        write_indexed_png(root / "hero.png", 8, 8, [(0, 0, 0), (248, 0, 0)], [1] * 64)
        family = {"id": "family", "name": "family", "kind": "palette", "palette_slot": "objects", "palette_values": [0, 0x7FFF], "bank_group": "room"}
        report = c.emit_pack_report({"assets": [asset("hero", 8), family]}, root)
        assert report["ok"], report["errors"]
        assert next(a for a in report["allocations"] if a["id"] == "family")["allocations"] == {}


if __name__ == "__main__":
    test_mixed_palette_is_exact_shared_even_and_preserves_text()
    test_disjoint_scenes_do_not_spend_each_others_palette()
    test_shared_palette_overflow_blocks_without_quantizing()
    test_mixed_palette_rejects_conflicting_fixed_placements()
    test_four_bpp_icons_share_a_bank_when_their_color_union_fits()
    test_eight_bpp_rgba_uses_exact_hardware_colors_without_quantization()
    test_extra_obj_resource_cannot_allocate_private_text_banks()
    test_palette_families_remain_compile_time_tables()
    print("assetc mixed OBJ palette tests passed")
