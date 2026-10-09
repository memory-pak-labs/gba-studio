#!/usr/bin/env python3
from pathlib import Path
import re
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
HARDWARE_SOURCE = ROOT / "engine" / "src" / "gbs_hw.c"
LINKER_SCRIPT = ROOT / "engine" / "startup" / "gba.ld"
STARTUP_SOURCE = ROOT / "engine" / "startup" / "crt0.S"
IRQ_SOURCE = ROOT / "engine" / "startup" / "irq.S"
RENDER_SOURCE = ROOT / "engine" / "src" / "gbs_render.cpp"
AUDIO_SOURCE = ROOT / "engine" / "src" / "gbs_audio.cpp"
EVENT_SOURCE = ROOT / "engine" / "src" / "gbs_event.cpp"
SHMUP_RUNTIME_SOURCE = ROOT / "templates" / "exported_shmup" / "main.cpp"
MENU_RUNTIME_SOURCE = ROOT / "templates" / "exported_menu" / "main.cpp"
CUTSCENE_RUNTIME_SOURCE = ROOT / "templates" / "exported_cutscene" / "main.cpp"
MAKEFILE = ROOT / "Makefile"
ISOMETRIC_SOURCE = ROOT / "engine" / "src" / "gbs_isometric.cpp"


def function_body(source: str, name: str) -> str:
    definition = re.search(r"\bvoid\s+" + re.escape(name) + r"\([^;{}]*\)\s*\{", source)
    if definition is None:
        raise AssertionError(f"definicao ausente para {name}")
    opening = definition.end() - 1
    depth = 0
    for index in range(opening, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[opening : index + 1]
    raise AssertionError(f"corpo incompleto para {name}")


class HardwareSourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = HARDWARE_SOURCE.read_text(encoding="utf-8")
        cls.linker_script = LINKER_SCRIPT.read_text(encoding="utf-8")
        cls.startup_source = STARTUP_SOURCE.read_text(encoding="utf-8")
        cls.irq_source = IRQ_SOURCE.read_text(encoding="utf-8")
        cls.render_source = RENDER_SOURCE.read_text(encoding="utf-8")
        cls.audio_source = AUDIO_SOURCE.read_text(encoding="utf-8")
        cls.event_source = EVENT_SOURCE.read_text(encoding="utf-8")
        cls.shmup_runtime_source = SHMUP_RUNTIME_SOURCE.read_text(encoding="utf-8")
        cls.menu_runtime_source = MENU_RUNTIME_SOURCE.read_text(encoding="utf-8")
        cls.cutscene_runtime_source = CUTSCENE_RUNTIME_SOURCE.read_text(encoding="utf-8")
        cls.makefile = MAKEFILE.read_text(encoding="utf-8")
        cls.isometric_source = ISOMETRIC_SOURCE.read_text(encoding="utf-8")

    def test_resident_font_lookup_tracks_eviction_pins_and_reinitialization(self) -> None:
        def definition(name):
            match = re.search(r"static (?:void|unsigned) " + name + r"\([^;{}]*\)\s*\{", self.source)
            self.assertIsNotNone(match)
            opening = match.end() - 1
            depth = 1
            end = opening + 1
            while depth:
                depth += (self.source[end] == "{") - (self.source[end] == "}")
                end += 1
            return self.source[match.start():end]

        harness = r'''
#include <assert.h>
#include "gbs/text.h"
#define DIALOGUE_TILE_GLYPH_BASE 900
#define DIALOGUE_TILE_SELECTOR (DIALOGUE_TILE_GLYPH_BASE + GBS_TEXT_RESIDENT_GLYPHS)
#define UI_BACKGROUND_LAYER 0
static uint16_t resident_font_glyphs[GBS_TEXT_RESIDENT_GLYPHS];
static uint8_t resident_font_slots[GBS_TEXT_GLYPH_COUNT];
static uint16_t shadow_bg_tilemaps[1][1024];
static unsigned loads;
static void load_resident_font_glyph(unsigned slot, unsigned glyph) {
    assert(slot < GBS_TEXT_RESIDENT_GLYPHS && resident_font_glyphs[slot] == glyph);
    ++loads;
}
''' + definition("rebuild_resident_font_slots") + definition("dialogue_bg_tile_for_codepoint") + r'''
int main(void) {
    for (int reset = 0; reset < 2; ++reset) {
        for (unsigned i = 0; i < GBS_TEXT_RESIDENT_GLYPHS; ++i) resident_font_glyphs[i] = i;
        rebuild_resident_font_slots();
        for (unsigned i = 0; i < 1024; ++i) shadow_bg_tilemaps[0][i] = 0;
        for (unsigned cycle = 0; cycle < 3; ++cycle) {
            for (unsigned glyph = 0; glyph < GBS_TEXT_GLYPH_COUNT; ++glyph) {
                const unsigned tile = dialogue_bg_tile_for_codepoint(gbs_font_codepoints[glyph]);
                assert(tile >= DIALOGUE_TILE_GLYPH_BASE && tile < DIALOGUE_TILE_SELECTOR);
                assert(resident_font_glyphs[tile - DIALOGUE_TILE_GLYPH_BASE] == glyph);
                const unsigned before = loads;
                assert(dialogue_bg_tile_for_codepoint(gbs_font_codepoints[glyph]) == tile);
                assert(loads == before);
            }
        }
        for (unsigned i = 0; i < GBS_TEXT_RESIDENT_GLYPHS; ++i)
            shadow_bg_tilemaps[0][i] = (DIALOGUE_TILE_GLYPH_BASE + i) | (13u << 12);
        unsigned missing = 0;
        while (resident_font_slots[missing] != 0xffu) ++missing;
        const unsigned before = loads;
        assert(dialogue_bg_tile_for_codepoint(gbs_font_codepoints[missing]) == DIALOGUE_TILE_GLYPH_BASE + 42);
        assert(loads == before && resident_font_glyphs[42] == 42);
        /* The only reusable slot must update both the evicted and new glyph. */
        shadow_bg_tilemaps[0][7] = 0;
        const unsigned old = resident_font_glyphs[7];
        assert(dialogue_bg_tile_for_codepoint(gbs_font_codepoints[missing]) == DIALOGUE_TILE_GLYPH_BASE + 7);
        assert(resident_font_slots[old] == 0xffu && resident_font_slots[missing] == 7);
    }
    return 0;
}
'''
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "font_cache.c"
            binary = Path(directory) / "font_cache"
            source.write_text(harness)
            subprocess.run(["cc", "-std=c11", "-Wall", "-Wextra", "-Werror", "-I" + str(ROOT / "engine/include"), str(source), str(ROOT / "engine/src/gbs_text.c"), "-o", str(binary)], check=True)
            subprocess.run([str(binary)], check=True)

    def test_menu_consumes_handoff_reveal_without_an_authored_entry_script(self) -> None:
        initializer = self.menu_runtime_source.split("int initialize_menu_runtime() {", 1)[1]
        initializer = initializer.split("gbs::RuntimeAdapterFrameResult update_menu_runtime", 1)[0]
        reveal = "gbs::consume_scene_transition_visual_effect_event(event_state);"
        self.assertIn(reveal, initializer)
        self.assertLess(initializer.index("start_screen("), initializer.index(reveal))

    def test_window_registers_pack_start_in_high_byte_and_end_in_low_byte(self) -> None:
        for window in (0, 1):
            with self.subTest(window=window):
                body = function_body(self.source, f"gbs_hw_set_window{window}")
                self.assertIn(f"REG_WIN{window}H = (uint16_t)(((left & 0xFFu) << 8) | (right & 0xFFu));", body)
                self.assertIn(f"REG_WIN{window}V = (uint16_t)(((top & 0xFFu) << 8) | (bottom & 0xFFu));", body)

    def test_cutscene_does_not_advance_while_a_runtime_handoff_is_requested(self) -> None:
        for function in ("advance_step", "update_cutscene"):
            body = function_body(self.cutscene_runtime_source, function)
            self.assertIn("if (gbs::runtime_transition_requested()) return;", body)
            self.assertLess(body.index("runtime_transition_requested()"), body.index("cutscene_scene_for"))

    def test_isometric_compositor_has_a_scoped_hot_path_build_contract(self) -> None:
        self.assertIn("GBA_ISOMETRIC_CXXFLAGS := $(GBA_CXXFLAGS) -O2", self.makefile)
        self.assertIn(
            "$(GBA_BUILD)/engine/gbs_isometric.o: engine/src/gbs_isometric.cpp",
            self.makefile,
        )
        self.assertIn("$(ARM_CXX) $(GBA_ISOMETRIC_CXXFLAGS) -c $< -o $@", self.makefile)
        self.assertIn("GBS_IWRAM_CODE void merge_iso_surface_tile_unscaled", self.isometric_source)

    def test_iwram_code_is_loaded_from_rom_before_the_runtime_starts(self) -> None:
        self.assertIn(".iwram_code", self.linker_script)
        self.assertIn("*(.iwram .iwram.*)", self.linker_script)
        self.assertIn("__iwram_code_load = LOADADDR(.iwram_code);", self.linker_script)
        self.assertIn("ldr r0, =__iwram_code_load", self.startup_source)
        self.assertIn("ldr r1, =__iwram_code_start", self.startup_source)
        self.assertIn("ldr r2, =__iwram_code_end", self.startup_source)

    def test_sprite_updates_are_staged_outside_hardware_oam(self) -> None:
        hide_body = function_body(self.source, "gbs_hw_hide_sprites")
        set_body = function_body(self.source, "gbs_hw_set_sprite")

        self.assertIn("shadow_oam", hide_body)
        self.assertIn("shadow_oam", set_body)
        self.assertNotIn("MEM_OAM", hide_body)
        self.assertNotIn("MEM_OAM", set_body)

    def test_hidden_sprites_use_the_explicit_obj_disabled_mode(self) -> None:
        hide_body = function_body(self.source, "gbs_hw_hide_sprites")
        set_body = function_body(self.source, "gbs_hw_set_sprite")

        self.assertIn("shadow_oam[index * 4 + 0] = (2u << 8);", hide_body)
        self.assertIn("shadow_oam[index * 4 + 0] = (2u << 8);", set_body)
        self.assertNotIn("shadow_oam[index * 4 + 0] = 160;", hide_body)
        self.assertNotIn("shadow_oam[index * 4 + 0] = 160;", set_body)

    def test_shadow_oam_is_committed_during_vblank(self) -> None:
        commit_body = function_body(self.source, "commit_shadow_oam")
        full_commit_body = function_body(self.source, "commit_shadow_oam_full")
        wait_body = function_body(self.source, "gbs_hw_wait_vblank")
        init_body = function_body(self.source, "gbs_hw_init")

        self.assertIn("shadow_oam_dirty_first", commit_body)
        self.assertIn("const uint32_t first = shadow_oam_dirty_first;", commit_body)
        self.assertIn("gbs_hw_dma_copy(3, shadow_oam + first * 4u, MEM_OAM + first * 4u, units, 0)", commit_body)
        self.assertIn("gbs_hw_dma_copy(3, shadow_oam, MEM_OAM, 128u * 4u, 0)", full_commit_body)
        self.assertIn("commit_shadow_oam();", wait_body)
        self.assertLess(wait_body.index("commit_shadow_oam();"), wait_body.index("gbs_emit_vblank_interrupt"))
        self.assertIn("commit_shadow_oam_full();", init_body)

    def test_render_publication_gate_defers_all_shadow_state_until_vram_is_ready(self) -> None:
        wait_body = function_body(self.source, "gbs_hw_wait_vblank")
        map_body = function_body(self.source, "gbs_hw_load_bg_tilemap")
        controls_body = function_body(self.source, "commit_shadow_bg_controls")

        self.assertIn("if (!render_publication_blocked)", wait_body)
        self.assertIn("commit_shadow_bg_controls();", wait_body)
        self.assertIn("commit_shadow_oam();", wait_body)
        self.assertIn("commit_shadow_bg_tilemaps();", wait_body)
        self.assertIn("commit_shadow_bg_scroll();", wait_body)
        self.assertIn("shadow_bg_map_size_pending_mask", map_body)
        self.assertNotIn("*control =", map_body)
        self.assertIn("shadow_bg_map_size_pending_mask", controls_body)

    def test_runtime_handoff_uses_a_hidden_fallback_until_the_staged_frame_is_published(self) -> None:
        fallback_body = function_body(self.source, "gbs_hw_set_render_handoff_fallback")
        wait_body = function_body(self.source, "gbs_hw_wait_vblank")

        self.assertIn("REG_DISPCNT = (1u << 6);", fallback_body)
        self.assertIn("render_handoff_fallback_active = 1", fallback_body)
        self.assertIn("render_handoff_fallback_active", wait_body)
        self.assertIn("shadow_bg_enabled_bits", wait_body)
        self.assertIn("REG_DISPCNT", wait_body)

    def test_optional_background_layers_start_disabled(self) -> None:
        init_body = function_body(self.source, "gbs_hw_init")

        self.assertIn(
            "REG_DISPCNT = (1u << 6) | (1u << 8) | (1u << 9) | (1u << 12);",
            init_body,
        )
        self.assertNotIn("(1u << 10)", init_body)
        self.assertNotIn("(1u << 11)", init_body)

    def test_affine_sprite_matrices_are_staged_in_shadow_oam(self) -> None:
        affine_body = function_body(self.source, "gbs_hw_set_sprite_affine")
        matrix_body = function_body(self.source, "gbs_hw_set_sprite_affine_matrix")
        sprite_body = function_body(self.source, "gbs_hw_set_sprite")
        self.assertIn("shadow_oam", affine_body)
        self.assertIn("shadow_oam", matrix_body)
        self.assertNotIn("MEM_OAM", affine_body)
        self.assertNotIn("MEM_OAM", matrix_body)
        visible_body = sprite_body[sprite_body.index("shadow_oam[index * 4 + 0] = (uint16_t)") :]
        self.assertNotIn("shadow_oam[index * 4 + 3] = 0", visible_body)
        self.assertIn("if (enabled)", affine_body)
        self.assertIn("attr0 & ~(1u << 8)", affine_body)

    def test_mode4_rect_updates_use_halfword_vram_writes(self) -> None:
        body = function_body(self.source, "gbs_hw_update_bitmap8_rect")
        self.assertIn("volatile uint16_t* destination", body)
        self.assertIn("pixel_offset / 2u", body)
        self.assertNotIn("volatile uint8_t* destination", body)

    def test_bitmap16_fill_uses_bios_fast_fill_with_safe_fallback(self) -> None:
        body = function_body(self.source, "gbs_hw_fill_bitmap16")
        self.assertIn("gbs_bios_cpu_fast_set", body)
        self.assertIn("pixel_count / 2u", body)
        self.assertIn("packed_color", body)

    def test_pcm_stereo_routes_fifo_a_right_and_fifo_b_left_and_stops_both_dmas(self) -> None:
        stereo_body = function_body(self.source, "gbs_hw_audio_start_pcm8_stereo_stream")
        stop_body = function_body(self.source, "gbs_hw_audio_stop_pcm8_stream")

        self.assertIn("(1u << 8) | (1u << 10) | (1u << 13) | (1u << 14)", stereo_body)
        self.assertIn("(1u << 11) | (1u << 15)", stereo_body)
        self.assertIn("volatile uint32_t* dma_b", stop_body)
        self.assertIn("dma_b[2] = 0", stop_body)

    def test_pcm_stream_tracks_fifo_dma_underruns_without_counting_first_block(self) -> None:
        init_body = function_body(self.source, "gbs_hw_audio_init")
        start_body = function_body(self.source, "gbs_hw_audio_start_pcm8_stereo_stream")
        stereo_body = function_body(self.source, "commit_pcm_stream_block")
        stop_body = function_body(self.source, "gbs_hw_audio_stop_pcm8_stream")

        self.assertIn("pcm_dma_block_started = 0", init_body)
        self.assertIn("pcm_underrun_count = 0", init_body)
        self.assertIn("pcm_dma_block_started = 0", start_body)
        self.assertIn("if (pcm_dma_block_started &&", stereo_body)
        self.assertIn("++pcm_underrun_count", stereo_body)
        self.assertIn("pcm_dma_block_started = 1", stereo_body)
        self.assertIn("pcm_dma_block_started = 0", stop_body)
        self.assertIn("uint32_t gbs_hw_audio_pcm_underrun_count(void)", self.source)
        self.assertIn("return pcm_underrun_count", self.source)

    def test_fifo_stream_publishes_in_vblank_and_bounds_dma_when_a_frame_is_late(self) -> None:
        submit = function_body(self.source, "gbs_hw_audio_submit_pcm8_stereo_stream_block")
        commit = function_body(self.source, "commit_pcm_stream_block")
        dispatch = function_body(self.source, "gbs_hw_irq_dispatch")
        self.assertIn("sample_count != 528u", submit)
        self.assertIn("REG_IME = 0", submit)
        self.assertIn("REG_IME = ime", submit)
        self.assertIn("gbs_audio_vblank_update();", dispatch)
        self.assertIn("commit_pcm_stream_block();", dispatch)
        self.assertLess(dispatch.index("commit_pcm_stream_block();"), dispatch.index("gbs_audio_vblank_update();"))
        self.assertIn("DMA_REPEAT", commit)
        self.assertIn("if (!pcm_pending_ready)", commit)
        self.assertIn("dma_a[2] = 0", commit)
        self.assertIn("dma_b[2] = 0", commit)
        self.assertIn("gbs_hw_timer_stop(1)", commit)

    def test_psg_pan_uses_discrete_soundcnt_l_channel_routes(self) -> None:
        body = function_body(self.source, "gbs_hw_audio_set_psg_pan")
        self.assertIn("1u << (7 + channel)", body)
        self.assertIn("1u << (11 + channel)", body)
        self.assertIn("pan <= 63", body)
        self.assertIn("pan >= -63", body)
        self.assertIn("REG_SOUNDCNT_L = control", body)

    def test_4bpp_background_and_object_tiles_use_32_byte_tiles_with_halfword_dma_units(self) -> None:
        background_body = function_body(self.source, "gbs_hw_load_bg_tiles")
        object_body = function_body(self.source, "gbs_hw_load_obj_tiles")
        indexed_background_body = function_body(self.source, "gbs_hw_load_bg_tiles_8bpp")

        self.assertIn("destination_tile * 16", background_body)
        self.assertIn("tile_count * 16", background_body)
        self.assertIn("destination_tile * 16", object_body)
        self.assertIn("tile_count * 16", object_body)
        # Indexed isometric viewports use a distinct 8bpp upload path. It
        # must keep the 64-byte source stride and submit only VBlank DMA.
        self.assertIn("MEM_VRAM + (base * 256u + tile) * 32u", indexed_background_body)
        self.assertIn("chunk * 32u", indexed_background_body)
        self.assertIn("data += chunk * 64u", indexed_background_body)
        self.assertIn("gbs_hw_enqueue_vblank_dma16", indexed_background_body)

    def test_8bpp_object_tiles_use_even_character_pairs(self) -> None:
        body = function_body(self.source, "gbs_hw_load_obj_tiles_8bpp")

        self.assertIn("(destination_tile & 1u) != 0", body)
        self.assertIn("destination_tile + tile_count * 2u", body)
        self.assertIn("tile_count * 32", body)
        self.assertNotIn("gbs_hw_dma_wait(3);", body)
        self.assertIn("gbs_hw_enqueue_vblank_dma16", body)

    def test_4bpp_tile_uploads_wait_for_dma_before_returning(self) -> None:
        background_body = function_body(self.source, "gbs_hw_load_bg_tiles")
        object_body = function_body(self.source, "gbs_hw_load_obj_tiles")

        self.assertNotIn("gbs_hw_dma_wait(3);", background_body)
        self.assertNotIn("gbs_hw_dma_wait(3);", object_body)
        self.assertIn("gbs_hw_enqueue_vblank_dma16", background_body)
        self.assertIn("gbs_hw_enqueue_vblank_dma16", object_body)

    def test_vram_flush_waits_for_the_last_dma3_transfer(self) -> None:
        body = function_body(self.source, "gbs_hw_flush_vram_writes")

        self.assertIn("gbs_hw_flush_vblank_dma_queue(3);", body)
        self.assertIn("gbs_hw_dma_wait(3);", body)
        self.assertLess(
            body.index("gbs_hw_flush_vblank_dma_queue(3);"),
            body.index("gbs_hw_dma_wait(3);")
        )

    def test_affine_background_tiles_use_64_byte_tiles_with_halfword_dma_units(self) -> None:
        generic_body = function_body(self.source, "gbs_hw_load_affine_bg_tiles")
        layered_body = function_body(self.source, "gbs_hw_load_affine_bg_tiles_for_layer")

        for body in (generic_body, layered_body):
            self.assertIn("destination_tile * 32", body)
            self.assertIn("tile_count * 32", body)
        self.assertNotIn("gbs_hw_dma_wait(3);", generic_body)
        self.assertNotIn("gbs_hw_dma_wait(3);", layered_body)
        self.assertIn("gbs_hw_enqueue_vblank_dma16", generic_body)
        self.assertIn("gbs_hw_enqueue_vblank_dma16", layered_body)

    def test_layered_affine_tiles_use_character_base_in_halfword_address_units(self) -> None:
        body = function_body(self.source, "gbs_hw_load_affine_bg_tiles_for_layer")

        self.assertIn("character_base * 0x2000u", body)
        self.assertNotIn("character_base * 0x4000u", body)

    def test_affine_128_map_does_not_overlap_ui_or_world_screenblocks(self) -> None:
        match = re.search(
            r"static (?:const )?uint16_t bg_screenblocks\[\] = \{\s*([^}]+)\};",
            self.source,
        )
        self.assertIsNotNone(match)
        starts = [int(value) for value in re.findall(r"\d+", match.group(1))]
        self.assertEqual(len(starts), 4)

        affine_match = re.search(
            r"static const uint16_t affine_screenblock_base = (\d+)u;",
            self.source,
        )
        self.assertIsNotNone(affine_match)

        ui_start, world_start, _, _ = starts
        affine_start = int(affine_match.group(1))
        affine_128_blocks = set(range(affine_start, affine_start + 8))
        self.assertNotIn(ui_start, affine_128_blocks)
        self.assertNotIn(world_start, affine_128_blocks)
        self.assertEqual(affine_start, 0)
        self.assertGreaterEqual(affine_start, 0)
        self.assertLessEqual(affine_start + 8, 32)

        tilemap_body = function_body(self.source, "gbs_hw_load_affine_bg_tilemap")
        self.assertIn("affine_screenblock_base", tilemap_body)
        self.assertIn("shadow_bg_screen_base_pending_mask", tilemap_body)
        self.assertIn("shadow_bg_map_size_pending_mask", tilemap_body)

    def test_affine_tiles_use_a_character_block_separate_from_ui_tiles(self) -> None:
        body = function_body(self.source, "gbs_hw_load_affine_bg_tiles_for_layer")

        self.assertIn("const uint32_t character_base = 2u;", body)
        self.assertIn("character_base * 0x2000u", body)

    def test_advanced_hud_text_uses_the_ui_bg_map_instead_of_limited_obj_slots(self) -> None:
        helper = function_body(self.source, "gbs_hw_draw_hud_text_at")
        component = function_body(self.source, "gbs_hw_draw_hud_layout_component")

        self.assertIn("shadow_bg_tilemaps[UI_BACKGROUND_LAYER]", helper)
        self.assertIn("dialogue_bg_tile_for_codepoint", helper)
        self.assertIn("ui_tile_entry(tile_index, HUD_PALETTE)", helper)
        self.assertIn("gbs_hw_draw_hud_text_at", component)
        self.assertNotIn("gbs_hw_draw_text_overlay_slot", component)

    def test_text_input_uses_a_dedicated_light_surface_and_text_palette(self) -> None:
        keyboard = function_body(self.source, "gbs_hw_draw_text_input_keyboard_with_controls")
        surface = function_body(self.source, "gbs_hw_draw_name_input_surface")
        overlay = function_body(self.source, "gbs_hw_draw_text_overlay_at")

        self.assertIn("gbs_hw_draw_name_input_surface", keyboard)
        self.assertNotIn("DIALOGUE_TILE_SKIN_BASE", keyboard)
        self.assertIn("NAME_INPUT_TILE_SURFACE", surface)
        self.assertIn("NAME_INPUT_TILE_BORDER", surface)
        self.assertNotIn("HUD_TILE_SKIN_BASE", surface)
        self.assertIn("name_input_tile_entry", surface)
        self.assertIn("name_input_tile_entry", keyboard)
        self.assertIn("palette,", overlay)
        self.assertIn("int visible,\n    unsigned palette", self.source)
        self.assertIn("NAME_INPUT_BG_PALETTE", self.source)
        self.assertIn("NAME_INPUT_OBJ_PALETTE", self.source)
        self.assertIn("256 + NAME_INPUT_OBJ_PALETTE_BASE", self.source)

    def test_ui_bg0_writes_are_staged_until_vblank(self) -> None:
        text_box = function_body(self.source, "gbs_hw_draw_text_box_with_skin")
        hud_surface = function_body(self.source, "gbs_hw_draw_hud_surface")
        hud_text = function_body(self.source, "gbs_hw_draw_hud_text_at")
        load_tilemap = function_body(self.source, "gbs_hw_load_bg_tilemap")
        set_tile = function_body(self.source, "gbs_hw_set_bg_tilemap_entry")

        for body in (text_box, hud_surface, hud_text):
            self.assertIn("shadow_bg_tilemaps[UI_BACKGROUND_LAYER]", body)

        self.assertIn("stage_tilemap", load_tilemap)
        self.assertIn("shadow_bg_tilemaps[layer]", load_tilemap)
        self.assertIn("shadow_bg_tilemap_pending_mask", set_tile)
        self.assertIn("shadow_bg_tilemap_pending_mask", self.source)

    def test_vblank_commits_the_staged_ui_bg0_map(self) -> None:
        commit_body = function_body(self.source, "commit_shadow_bg_tilemaps")
        wait_body = function_body(self.source, "gbs_hw_wait_vblank")

        self.assertIn("shadow_bg_tilemaps[layer]", commit_body)
        self.assertIn("screenblock_address(bg_screenblocks[layer])", commit_body)
        self.assertIn("commit_shadow_bg_tilemaps();", wait_body)

    def test_affine_tilemap_does_not_reserve_a_full_map_copy(self) -> None:
        self.assertNotIn("affine_tilemap_upload_buffer", self.source)
        body = function_body(self.source, "gbs_hw_load_affine_bg_tilemap")
        self.assertIn("gbs_hw_enqueue_vblank_dma16(entries, destination, width * height / 2u)", body)

    def test_affine_tilemap_uses_halfword_safe_vram_transfer(self) -> None:
        body = function_body(self.source, "gbs_hw_load_affine_bg_tilemap")

        self.assertIn("volatile uint16_t* destination", body)
        self.assertIn("gbs_hw_enqueue_vblank_dma16", body)
        self.assertIn("width * height / 2u", body)
        self.assertNotIn("volatile uint8_t* destination", body)
        self.assertNotIn("destination[index] = entries[index];", body)

    def test_affine_uploads_wait_for_dma_before_following_vram_work(self) -> None:
        tile_body = function_body(self.source, "gbs_hw_load_affine_bg_tiles_for_layer")
        tilemap_body = function_body(self.source, "gbs_hw_load_affine_bg_tilemap")

        self.assertNotIn("gbs_hw_dma_wait(3);", tile_body)
        self.assertNotIn("gbs_hw_dma_wait(3);", tilemap_body)
        self.assertIn("gbs_hw_enqueue_vblank_dma16", tile_body)
        self.assertIn("gbs_hw_enqueue_vblank_dma16", tilemap_body)
        self.assertIn("DMA_ENABLE", self.source)

    def test_shmup_configures_ui_before_affine_background(self) -> None:
        entry_start = self.shmup_runtime_source.index(
            "int initialize_shmup_runtime()"
        )
        entry_source = self.shmup_runtime_source[entry_start:]
        configure_index = entry_source.index("gbastudio_dialogue_ui::configure();")
        configure_scene_index = entry_source.index(
            "gbastudio_dialogue_ui::configure_for_scene("
        )
        apply_index = entry_source.index("    apply_background();")

        self.assertLess(configure_index, apply_index)
        self.assertLess(configure_scene_index, apply_index)

        transition_dispatch = function_body(self.shmup_runtime_source, "maybe_advance_wave")
        self.assertIn("advance_cleared_wave();", transition_dispatch)
        restored_script = function_body(
            self.shmup_runtime_source, "finish_restored_shmup_script"
        )
        self.assertIn("if (script_index == 1) advance_cleared_wave();", restored_script)
        transition_body = function_body(self.shmup_runtime_source, "advance_cleared_wave")
        transition_configure_index = transition_body.find(
            "gbastudio_dialogue_ui::configure_for_scene("
        )
        transition_apply_index = transition_body.find("        apply_background();")
        self.assertGreaterEqual(transition_configure_index, 0)
        self.assertGreaterEqual(transition_apply_index, 0)
        self.assertLess(transition_configure_index, transition_apply_index)

    def test_affine_background_wrap_is_configured_on_the_affine_control_bit(self) -> None:
        body = function_body(self.source, "gbs_hw_set_affine_bg_wrap")

        self.assertIn("layer != 2 && layer != 3", body)
        self.assertIn("1u << 13", body)
        self.assertIn("enabled", body)

    def test_custom_dialogue_font_writes_gba_tiles_as_halfwords(self) -> None:
        body = function_body(self.source, "load_custom_dialogue_font")
        bg_body = function_body(self.source, "load_resident_font_glyph")
        obj_body = self.source.split("static unsigned dialogue_obj_tile_for_codepoint", 2)[2].split("static void load_custom_dialogue_font", 1)[0]
        configure_body = function_body(self.source, "gbs_hw_configure_dialogue_font")
        restore_body = function_body(self.source, "gbs_hw_restore_ui_assets")
        font_byte_start = self.source.index("static uint8_t dialogue_font_bg_byte")
        font_byte_body = self.source[font_byte_start : self.source.index("\n}", font_byte_start) + 2]

        self.assertIn("load_resident_font_glyph(slot, resident_font_glyphs[slot])", body)
        self.assertIn("volatile uint16_t* target", bg_body)
        self.assertIn("* 16u", bg_body)
        self.assertIn("i < 16", bg_body)
        self.assertIn("dialogue_font_bg_byte(source[i * 2])", bg_body)
        self.assertIn("dialogue_font_bg_byte(source[i * 2 + 1])", bg_body)
        self.assertIn("volatile uint16_t* target", obj_body)
        self.assertIn("source[i * 2]", obj_body)
        self.assertIn("source[i * 2 + 1]", obj_body)
        self.assertIn("low = low == 0 ? (bg_font_transparent ? 0 : DIALOGUE_COLOR_BACKGROUND) : DIALOGUE_COLOR_TEXT", font_byte_body)
        self.assertIn("high = high == 0 ? (bg_font_transparent ? 0 : DIALOGUE_COLOR_BACKGROUND) : DIALOGUE_COLOR_TEXT", font_byte_body)
        self.assertNotIn("volatile uint8_t* target", bg_body)
        self.assertNotIn("volatile uint8_t* target", obj_body)
        self.assertIn("configured_dialogue_font_tiles = tiles;", configure_body)
        self.assertIn("load_custom_dialogue_font(configured_dialogue_font_tiles);", restore_body)

    def test_custom_dialogue_font_maps_both_nibbles_in_both_background_modes(self) -> None:
        start = self.source.index("static uint8_t dialogue_font_bg_byte")
        body = self.source[start : self.source.index("\n}", start) + 2]
        harness = """#include <stdint.h>
#define DIALOGUE_COLOR_BACKGROUND 2
#define DIALOGUE_COLOR_TEXT 9
static int bg_font_transparent;
""" + body + """
int main(void) {
    for (int transparent = 0; transparent <= 1; ++transparent) {
        bg_font_transparent = transparent;
        for (int value = 0; value < 256; ++value) {
            unsigned background = transparent ? 0 : DIALOGUE_COLOR_BACKGROUND;
            unsigned low = (value & 15) ? DIALOGUE_COLOR_TEXT : background;
            unsigned high = (value >> 4) ? DIALOGUE_COLOR_TEXT : background;
            if (dialogue_font_bg_byte((uint8_t)value) != (low | (high << 4))) return 1;
        }
    }
    return 0;
}
"""
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "font-byte.c"
            executable = Path(temporary) / "font-byte"
            source.write_text(harness, encoding="utf-8")
            subprocess.run(["cc", "-std=c11", "-Wall", "-Wextra", "-Werror", str(source), "-o", str(executable)], check=True)
            subprocess.run([str(executable)], check=True)

    def test_paged_isometric_viewport_reuses_tiles_but_keeps_pixel_scroll(self) -> None:
        runtime = (ROOT / "examples/isometric_basic/src/main.cpp").read_text(encoding="utf-8")
        body = function_body(
            runtime.replace("bool render_paged_isometric_viewport(", "void render_paged_isometric_viewport(", 1),
            "render_paged_isometric_viewport",
        )
        harness = """#include <cassert>
#include <cstdint>
#include <cstring>
namespace gbs {
constexpr int iso_paged_background_slots = 651;
enum class BackgroundLayer { BG2, BG3 };
enum class ColorDepth { Bpp8 };
struct IsoBakedComposition { int width = 64; int height = 43; };
struct Window { int tile_x = 0; int tile_y = 0; bool initialized = false; };
struct TileAsset { const uint8_t* tiles; uint16_t count; uint16_t first; bool compressed; ColorDepth depth; };
struct TileMap { const uint16_t* tiles; int width; int height; };
int updates = 0, uploads = 0, maps = 0, scrolls = 0, scroll_x = 0, scroll_y = 0;
int pending = 5, waits = 0;
size_t dma_vblank_queue_count() { return pending; }
void wait_vblank() { ++waits; if (pending > 0) --pending; }
template<class Upload>
bool update_iso_paged_surface(const IsoBakedComposition& surface, Window& window, int x, int y,
                              uint16_t*, uint16_t*, Upload upload) {
    ++updates;
    if (x < 0 || y < 0 || x > surface.width * 8 - 240 || y > surface.height * 8 - 160) return false;
    if (window.initialized && window.tile_x == x / 8 && window.tile_y == y / 8) return true;
    static const uint8_t pixels[64] = {};
    upload(0, pixels);
    window = {x / 8, y / 8, true};
    return true;
}
bool load_bg_tiles_at_character_base(TileAsset, int) { ++uploads; return true; }
bool load_tilemap(BackgroundLayer, TileMap) { ++maps; return true; }
void set_bg_scroll(BackgroundLayer, int x, int y) { ++scrolls; scroll_x = x; scroll_y = y; }
}
gbs::Window iso_paged_window;
uint8_t iso_surface_tiles[600 * 64] {}, iso_foreground_unique_tiles[51 * 64] {};
uint16_t iso_surface_map[1024] {}, iso_foreground_map[1024] {};
bool render_paged_isometric_viewport(const gbs::IsoBakedComposition& surface, int x, int y)
""" + body + """
int main() {
    gbs::IsoBakedComposition surface;
    assert(render_paged_isometric_viewport(surface, 0, 0));
    assert(gbs::updates == 1 && gbs::uploads == 1 && gbs::maps == 2);
    // Initial uploads outlive one VBlank budget. They must finish before
    // the next camera update can recycle their source slots.
    assert(gbs::pending == 0 && gbs::waits == 5);
    assert(render_paged_isometric_viewport(surface, 7, 7));
    // Subtile motion must update both BG scrolls without scanning 651 slots.
    assert(gbs::updates == 1 && gbs::uploads == 1 && gbs::maps == 2);
    assert(gbs::scrolls == 4 && gbs::scroll_x == 7 && gbs::scroll_y == 7);
    assert(render_paged_isometric_viewport(surface, 8, 7));
    assert(gbs::updates == 2 && gbs::uploads == 2 && gbs::maps == 4);
    assert(render_paged_isometric_viewport(surface, 8, 8));
    assert(gbs::updates == 3 && gbs::uploads == 3 && gbs::maps == 6);
    assert(render_paged_isometric_viewport(surface, 0, 0));
    assert(gbs::updates == 4);
    assert(!render_paged_isometric_viewport(surface, -1, 0));
    assert(!render_paged_isometric_viewport(surface, 0, -1));
    assert(render_paged_isometric_viewport(surface, 272, 184));
    assert(!render_paged_isometric_viewport(surface, 273, 184));
    assert(!render_paged_isometric_viewport(surface, 272, 185));
    const int uploads = gbs::uploads;
    // The room-entry/reset path invalidates residency, including same-camera reloads.
    iso_paged_window = {};
    assert(render_paged_isometric_viewport(surface, 272, 184));
    assert(gbs::uploads == uploads + 1);
}
"""
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "paged-viewport.cpp"
            executable = Path(temporary) / "paged-viewport"
            source.write_text(harness, encoding="utf-8")
            subprocess.run(["c++", "-std=c++17", "-Wall", "-Wextra", "-Werror", str(source), "-o", str(executable)], check=True)
            subprocess.run([str(executable)], check=True)

    def test_name_input_glyphs_use_a_dark_palette_slot(self) -> None:
        glyph_body = function_body(self.source, "gbs_hw_draw_text_input_keyboard_glyph")

        self.assertIn("NAME_INPUT_TEXT_PALETTE = 11", self.source)
        self.assertIn("name_input_glyph_tile_entry", glyph_body)
        self.assertNotIn("name_input_tile_entry(dialogue_bg_tile_for_codepoint", glyph_body)

    def test_dma_fixed_destination_encodes_the_hardware_fixed_mode(self) -> None:
        value = re.search(r"#define DMA_DEST_FIXED (0x[0-9A-Fa-f]+)u", self.source)
        self.assertIsNotNone(value)
        self.assertEqual((int(value.group(1), 16) >> 21) & 3, 2)

    def test_hblank_dma_uses_repeat_and_hblank_start_timing(self) -> None:
        start_body = function_body(self.source, "gbs_hw_hdma_start")
        stop_body = function_body(self.source, "gbs_hw_hdma_stop")
        scroll_body = function_body(self.source, "gbs_hw_start_hblank_bg_scroll")
        commit_body = function_body(self.source, "commit_hblank_bg_scroll")
        wait_body = function_body(self.source, "gbs_hw_wait_vblank")
        self.assertIn("DMA_REPEAT", start_body)
        self.assertIn("DMA_START_HBLANK", start_body)
        self.assertIn("dma[2] = 0", stop_body)
        self.assertIn("pending_hblank_scroll_offsets", scroll_body)
        self.assertNotIn("gbs_hw_hdma_start", scroll_body)
        self.assertIn("gbs_hw_hdma_start", commit_body)
        self.assertIn(
            "if (!affine_hblank_enabled && !pending_hblank_scroll_enabled && !pending_hblank_scroll_dirty)",
            commit_body,
        )
        self.assertIn("commit_hblank_bg_scroll();", wait_body)
        affine_body = function_body(self.source, "gbs_hw_start_hblank_affine")
        self.assertIn("affine_hblank_active_buffer^1u", affine_body)
        self.assertIn("pending_hblank_scroll_dirty=1", affine_body)
        self.assertIn("if(pending_hblank_scroll_dirty) affine_hblank_active_buffer ^= 1u", commit_body)
        self.assertIn("DMA_REPEAT|DMA_START_HBLANK|DMA_32BIT|DMA_ENABLE", commit_body)
        self.assertIn("4u|0x00600000u", commit_body)

    def test_immediate_dma_disables_previous_transfer_before_reprogramming(self) -> None:
        body = function_body(self.source, "gbs_hw_dma_copy")

        self.assertIn("gbs_hw_dma_wait(channel);", body)
        self.assertIn("dma[2] = 0;", body)
        self.assertLess(body.index("gbs_hw_dma_wait(channel);") , body.index("dma[2] = 0;"))
        self.assertLess(body.index("dma[2] = 0;"), body.index("dma[0] = (uint32_t)source;"))
        self.assertLess(body.index("dma[0] = (uint32_t)source;"), body.index("dma[2] = units | DMA_ENABLE"))

    def test_immediate_dma_rejects_channels_owned_by_hblank_dma(self) -> None:
        body = function_body(self.source, "gbs_hw_dma_copy")
        start_body = function_body(self.source, "gbs_hw_hdma_start")
        stop_body = function_body(self.source, "gbs_hw_hdma_stop")

        self.assertIn("hblank_dma_active_mask", self.source)
        self.assertIn("if ((hblank_dma_active_mask & (1u << channel)) != 0u)", body)
        self.assertIn("return;", body)
        self.assertIn("hblank_dma_active_mask = (uint8_t)(hblank_dma_active_mask | (1u << channel))", start_body)
        self.assertIn("hblank_dma_active_mask = (uint8_t)(hblank_dma_active_mask & ~(1u << channel))", stop_body)

    def test_streamed_room_tilemaps_are_staged_and_committed_during_vblank(self) -> None:
        draw8_body = function_body(self.source, "gbs_hw_draw_room_to_bg")
        draw16_body = function_body(self.source, "gbs_hw_draw_room16_to_bg")
        commit_body = function_body(self.source, "commit_shadow_bg_tilemaps")
        wait_body = function_body(self.source, "gbs_hw_wait_vblank")

        self.assertIn("stage_room_tilemap8", draw8_body)
        self.assertIn("stage_room_tilemap16", draw16_body)
        self.assertNotIn("screenblock_address", draw8_body)
        self.assertNotIn("screenblock_address", draw16_body)
        self.assertIn("shadow_bg_tilemaps[layer]", commit_body)
        self.assertIn("32u * 32u", commit_body)
        self.assertIn("commit_shadow_bg_tilemaps();", wait_body)
        self.assertLess(
            wait_body.index("commit_shadow_bg_tilemaps();"),
            wait_body.index("gbs_emit_vblank_interrupt"),
        )

    def test_background_scroll_is_staged_and_committed_during_vblank(self) -> None:
        set_scroll_body = function_body(self.source, "gbs_hw_set_bg_scroll")
        commit_body = function_body(self.source, "commit_shadow_bg_scroll")
        wait_body = function_body(self.source, "gbs_hw_wait_vblank")
        init_body = function_body(self.source, "gbs_hw_init")

        self.assertIn("shadow_bg_scroll_x[layer]", set_scroll_body)
        self.assertIn("shadow_bg_scroll_y[layer]", set_scroll_body)
        self.assertIn("shadow_bg_scroll_pending_mask", set_scroll_body)
        self.assertNotIn("0x04000010", set_scroll_body)
        self.assertIn("0x04000010 + layer * 4", commit_body)
        self.assertIn("shadow_bg_scroll_x[layer]", commit_body)
        self.assertIn("shadow_bg_scroll_y[layer]", commit_body)
        self.assertIn("commit_shadow_bg_scroll();", wait_body)
        self.assertLess(
            wait_body.index("commit_shadow_bg_scroll();"),
            wait_body.index("gbs_emit_vblank_interrupt"),
        )
        self.assertIn("commit_shadow_bg_scroll();", init_body)

    def test_background_layer_controls_are_staged_and_committed_during_vblank(self) -> None:
        enabled_body = function_body(self.source, "gbs_hw_set_bg_enabled")
        character_base_body = function_body(self.source, "gbs_hw_set_bg_character_base")
        priority_body = function_body(self.source, "gbs_hw_set_bg_priority")
        commit_body = function_body(self.source, "commit_shadow_bg_controls")
        wait_body = function_body(self.source, "gbs_hw_wait_vblank")

        self.assertIn("shadow_bg_enabled_bits", enabled_body)
        self.assertNotIn("REG_DISPCNT =", enabled_body)
        self.assertIn("shadow_bg_character_base", character_base_body)
        self.assertNotIn("*control =", character_base_body)
        self.assertIn("shadow_bg_priority", priority_body)
        self.assertNotIn("*control =", priority_body)
        self.assertIn("commit_shadow_bg_controls();", wait_body)
        self.assertIn("shadow_bg_enabled_bits", commit_body)
        self.assertIn("shadow_bg_character_base", commit_body)
        self.assertIn("shadow_bg_priority", commit_body)

    def test_vblank_interrupt_enables_display_status_and_hardware_ie(self) -> None:
        body = function_body(self.source, "gbs_hw_enable_interrupt_source")

        self.assertIn("REG_IME = 0", body)
        self.assertIn("REG_DISPSTAT = (uint16_t)(REG_DISPSTAT | (1u << 3))", body)
        self.assertIn("REG_IE = (uint16_t)(REG_IE | mask)", body)
        self.assertIn("REG_IME = 1", body)
        self.assertNotIn("if (source == 0) {\n        REG_DISPSTAT", body.split("REG_IME = 0", 1)[0])

    def test_keypad_interrupt_selects_real_buttons_before_enabling_irq(self) -> None:
        body = function_body(self.source, "gbs_hw_enable_interrupt_source")

        self.assertIn("REG_KEYCNT = (uint16_t)(0x03FFu | (1u << 14))", body)

    def test_linker_reserves_stacks_and_rejects_iwram_overlap(self) -> None:
        self.assertIn("__irq_stack_size = 0x200", self.linker_script)
        self.assertIn("__svc_stack_size = 0x100", self.linker_script)
        self.assertIn("__system_stack_size = 0x2000", self.linker_script)
        self.assertIn(
            "__irq_handler_slot = ORIGIN(IWRAM) + LENGTH(IWRAM) - 4",
            self.linker_script,
        )
        self.assertIn("__irq_stack_top = __irq_handler_slot", self.linker_script)
        self.assertIn("__stack_bottom = __stack_top - __system_stack_size", self.linker_script)
        self.assertIn("ASSERT(__bss_end <= __stack_bottom", self.linker_script)

    def test_startup_unmasks_cpu_interrupts_before_entering_system_mode(self) -> None:
        clear_mask = "bic r0, r0, #0xC0"
        self.assertIn(clear_mask, self.startup_source)
        self.assertLess(self.startup_source.index(clear_mask), self.startup_source.index("orr r1, r0, #0x12"))

    def test_irq_entry_returns_through_bios_trampoline(self) -> None:
        self.assertIn("stmdb sp!, {r4-r11, lr}", self.irq_source)
        self.assertIn("bl gbs_hw_irq_dispatch", self.irq_source)
        self.assertIn("ldmia sp!, {r4-r11, lr}", self.irq_source)
        self.assertIn("bx lr", self.irq_source)
        self.assertNotIn("subs pc, lr, #4", self.irq_source)

    def test_large_render_staging_buffers_are_kept_in_ewram(self) -> None:
        buffers = (
            "tilemap_decode_buffer",
            "lz77_tilemap_decode_buffer",
            "lz77_tile_decode_buffer",
            "lz77_palette_decode_buffer",
            "palette_decode_buffer",
            "dynamic_palette_buffer",
        )

        self.assertIn(
            '#define GBS_RENDER_EWRAM __attribute__((section(".ewram_bss")))',
            self.render_source,
        )
        self.assertIn("#if defined(__arm__) || defined(__thumb__)", self.render_source)
        self.assertIn("#else\n#define GBS_RENDER_EWRAM\n#endif", self.render_source)
        for buffer in buffers:
            declaration = next(
                line for line in self.render_source.splitlines() if buffer in line
            )
            self.assertIn("GBS_RENDER_EWRAM", declaration, buffer)

    def test_runtime_transition_handoff_state_is_kept_in_ewram(self) -> None:
        self.assertIn(
            '#define GBS_EVENT_EWRAM __attribute__((section(".ewram_bss")))',
            self.event_source,
        )
        self.assertIn("#if defined(__arm__) || defined(__thumb__)", self.event_source)
        self.assertIn("#else\n#define GBS_EVENT_EWRAM\n#endif", self.event_source)
        self.assertIn(
            "RuntimeTransitionState runtime_transition GBS_EVENT_EWRAM {};",
            self.event_source,
        )

    def test_pcm_mix_buffers_are_kept_in_ewram_on_arm(self) -> None:
        self.assertIn(
            '#define GBS_AUDIO_EWRAM __attribute__((section(".ewram_bss")))',
            self.audio_source,
        )
        self.assertIn(
            "alignas(4) uint8_t pcm_mix_buffers[2][2][gbs::PCM_MIXER_SAMPLES_PER_FRAME + 32] GBS_AUDIO_EWRAM {};",
            self.audio_source,
        )

    def test_pcm_mixer_preserves_signed_samples_for_fifo_bytes(self) -> None:
        self.assertIn("uint8_t encode_pcm_fifo_sample(int8_t sample)", self.audio_source)
        self.assertIn("return static_cast<uint8_t>(sample);", self.audio_source)
        self.assertIn("encode_pcm_fifo_sample(clamp_pcm_sample(pcm_mix_accumulator[index]))", self.audio_source)
        self.assertIn("uint8_t* output = side == 0 ? left_buffer : right_buffer;", self.audio_source)
        self.assertIn("write_pcm_mix_side(output, pcm_block_stereo ? nullptr : right_buffer)", self.audio_source)


if __name__ == "__main__":
    unittest.main()
