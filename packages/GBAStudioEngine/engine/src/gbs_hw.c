#include "gbs_hw.h"
#include "gbs_room_tilemap.h"
#include "gbs/text.h"

#define REG16(address) (*(volatile uint16_t*)(address))
#define REG32(address) (*(volatile uint32_t*)(address))

#define REG_DISPCNT REG16(0x04000000)
#define REG_DISPSTAT REG16(0x04000004)
#define REG_VCOUNT REG16(0x04000006)
#define REG_BG0CNT REG16(0x04000008)
#define REG_BG1CNT REG16(0x0400000A)
#define REG_BG2CNT REG16(0x0400000C)
#define REG_BG3CNT REG16(0x0400000E)
#define REG_BG0HOFS REG16(0x04000010)
#define REG_BG0VOFS REG16(0x04000012)
#define REG_BG2PA REG16(0x04000020)
#define REG_BG2X REG32(0x04000028)
#define REG_BG3PA REG16(0x04000030)
#define REG_BG3X REG32(0x04000038)
#define REG_WIN0H REG16(0x04000040)
#define REG_WIN1H REG16(0x04000042)
#define REG_WIN0V REG16(0x04000044)
#define REG_WIN1V REG16(0x04000046)
#define REG_WININ REG16(0x04000048)
#define REG_WINOUT REG16(0x0400004A)
#define REG_MOSAIC REG16(0x0400004C)
#define REG_BLDCNT REG16(0x04000050)
#define REG_BLDALPHA REG16(0x04000052)
#define REG_BLDY REG16(0x04000054)
#define REG_KEYINPUT REG16(0x04000130)
#define REG_KEYCNT REG16(0x04000132)
#define REG_IE REG16(0x04000200)
#define REG_IF REG16(0x04000202)
#define REG_IME REG16(0x04000208)
#define BIOS_IRQ_FLAGS REG16(0x03007FF8)
#define REG_SOUND1CNT_L REG16(0x04000060)
#define REG_SOUND1CNT_H REG16(0x04000062)
#define REG_SOUND1CNT_X REG16(0x04000064)
#define REG_SOUND2CNT_L REG16(0x04000068)
#define REG_SOUND2CNT_H REG16(0x0400006C)
#define REG_SOUND3CNT_L REG16(0x04000070)
#define REG_SOUND3CNT_H REG16(0x04000072)
#define REG_SOUND3CNT_X REG16(0x04000074)
#define REG_SOUND4CNT_L REG16(0x04000078)
#define REG_SOUND4CNT_H REG16(0x0400007C)
#define REG_SOUNDCNT_L REG16(0x04000080)
#define REG_SOUNDCNT_H REG16(0x04000082)
#define REG_SOUNDCNT_X REG16(0x04000084)
#define REG_FIFO_A REG32(0x040000A0)
#define REG_FIFO_B REG32(0x040000A4)
#define REG_SIOCNT REG16(0x04000128)
#define REG_SIODATA8 REG16(0x0400012A)
#define REG_SIODATA32 REG32(0x04000120)
#define REG_SIOMULTI0 REG16(0x04000120)
#define REG_SIOMULTI1 REG16(0x04000122)
#define REG_SIOMULTI2 REG16(0x04000124)
#define REG_SIOMULTI3 REG16(0x04000126)
#define REG_SIOMLT_SEND REG16(0x0400012A)
#define REG_RCNT REG16(0x04000134)

#define MEM_PALETTE ((volatile uint16_t*)0x05000000)
#define MEM_VRAM ((volatile uint16_t*)0x06000000)
#define MEM_OBJ_TILES ((volatile uint16_t*)0x06010000)
#define MEM_OAM ((volatile uint16_t*)0x07000000)
#define MEM_WAVE_RAM ((volatile uint32_t*)0x04000090)
#define MEM_IRQ_HANDLER (*(void (**)(void))0x03007FFC)

static uint16_t shadow_oam[128 * 4];
static uint8_t shadow_oam_dirty_first;
static uint8_t shadow_oam_dirty_last;
static uint32_t oam_overflow_count;
static uint8_t hud_icon_obj_count;
static int hud_icon_obj_write;
static uint16_t shadow_bg_tilemaps[4][32 * 32] __attribute__((section(".ewram_bss")));
static uint8_t shadow_bg_tilemap_pending_mask;
static uint8_t shadow_bg_map_size[4];
static uint8_t shadow_bg_map_size_pending_mask;
static uint16_t shadow_bg_scroll_x[4];
static uint16_t shadow_bg_scroll_y[4];
static uint8_t shadow_bg_scroll_pending_mask;
static uint16_t shadow_bg_enabled_bits;
static uint8_t shadow_bg_enabled_pending;
static uint8_t render_publication_blocked;
static uint8_t render_handoff_fallback_active;
static uint8_t shadow_bg_character_base[4];
static uint8_t shadow_bg_character_base_pending_mask;
static uint8_t shadow_bg_depth_mask;
static uint8_t shadow_bg_depth[4];
static uint16_t ui_character_base;
static uint8_t shadow_bg_priority[4];
static uint8_t shadow_bg_priority_pending_mask;
static const int16_t* pending_hblank_scroll_offsets;
static int pending_hblank_scroll_layer;
static uint8_t pending_hblank_scroll_enabled;
static uint8_t pending_hblank_scroll_dirty;
static uint32_t affine_hblank_words[2][161 * 4] __attribute__((section(".ewram_bss"), aligned(4)));
static uint8_t affine_hblank_active_buffer;
static uint8_t affine_hblank_enabled;
static uint8_t affine_hblank_layer;

static volatile uint8_t hblank_dma_active_mask;
static volatile uint8_t keypad_irq_pending;
static uint8_t pcm_dma_block_started;
static uint32_t pcm_underrun_count;
static const uint8_t* volatile pcm_pending_left;
static const uint8_t* volatile pcm_pending_right;
static volatile uint8_t pcm_pending_ready;
static uint8_t pcm_stereo_stream;
static uint8_t pcm_timer_running;
static uint8_t pcm_stop_after_pending;
static void commit_pcm_stream_block(void);
// Hardware-only host links may omit the mixer; the engine supplies this hook.
void __attribute__((weak)) gbs_audio_vblank_update(void) {}

static uint16_t bg_screenblocks[] = { 24, 28, 20, 16 };
static uint8_t shadow_bg_screen_base_pending_mask;
/* A 128x128 affine map consumes screenblocks 0-7. Its character data uses
 * character base 2 (screenblocks 16-23), while the UI's high-index 4bpp
 * assets remain in character base 1 and the UI/world maps remain at 24/28. */
static const uint16_t affine_screenblock_base = 0u;

enum {
    /* BG0 = UI (menu/dialogue/HUD). BG1 = dynamic room tilemap. BG2/BG3 = optional parallax. */
    UI_BACKGROUND_LAYER = 0,
    WORLD_BACKGROUND_LAYER = 1,
    DIALOGUE_TILE_BLANK = 896,
    DIALOGUE_TILE_BORDER = 897,
    /* 9-slice custom skin tiles (loaded on demand by gbs_hw_configure_dialogue_box_skin). */
    DIALOGUE_TILE_SKIN_BASE = 898,
    DIALOGUE_TILE_SKIN_COUNT = 9,
    DIALOGUE_TILE_GLYPH_BASE = 907,
    DIALOGUE_TILE_SELECTOR = DIALOGUE_TILE_GLYPH_BASE + GBS_TEXT_RESIDENT_GLYPHS,
    HUD_TILE_SKIN_BASE = DIALOGUE_TILE_SELECTOR + 1,
    HUD_TILE_SKIN_COUNT = 9,
    /* Name entry keeps a neutral surface independent from dialogue/HUD skins.
     * The dedicated tiles remain in the last three UI slots. */
    NAME_INPUT_TILE_SURFACE = HUD_TILE_SKIN_BASE + HUD_TILE_SKIN_COUNT,
    NAME_INPUT_TILE_BORDER = NAME_INPUT_TILE_SURFACE + 1,
    NAME_INPUT_TILE_SELECTOR = NAME_INPUT_TILE_BORDER + 1,
    DIALOGUE_PALETTE = 15,
    DIALOGUE_PALETTE_BASE = DIALOGUE_PALETTE * 16,
    HUD_PALETTE = 14,
    HUD_PALETTE_BASE = HUD_PALETTE * 16,
    /* Bank 4 is authored into the light background and provides a warm,
     * readable surface with a darker glyph slot, preserving fidelity. OBJ
     * text keeps the private bank 13 below. */
    NAME_INPUT_BG_PALETTE = 4,
    /* The authored keyboard uses bank 4 for its keycaps. Its color index 4
     * is light, so dynamic glyphs use the dark text slot from bank 11. */
    NAME_INPUT_TEXT_PALETTE = 11,
    NAME_INPUT_OBJ_PALETTE = 13,
    NAME_INPUT_OBJ_PALETTE_BASE = NAME_INPUT_OBJ_PALETTE * 16,
    DIALOGUE_COLOR_BACKGROUND = 1,
    DIALOGUE_COLOR_TEXT = 4,
    NAME_INPUT_COLOR_BACKGROUND = 1,
    NAME_INPUT_COLOR_BORDER = 2,
    NAME_INPUT_COLOR_TEXT = 4,
    NAME_INPUT_COLOR_SELECTOR = 5,
    DIALOGUE_BOX_X = 1,
    DIALOGUE_BOX_Y = 14,
    DIALOGUE_BOX_W = 28,
    DIALOGUE_BOX_H = 6,
    DIALOGUE_TEXT_W = 26,
    DIALOGUE_TEXT_LINES = 3,
    DYNAMIC_TEXT_OBJ_TILE_BASE = 900,
    NAME_KEYBOARD_OBJ_OAM_BASE = 40,
    NAME_KEYBOARD_OBJ_OAM_COUNT = 40,
    NAME_KEYBOARD_OBJ_GLYPH_OFFSET = 36,
    /* Reserve the last 32 OAM entries for dynamic status text. Fighters use
     * the lower entries, so the luta HUD can compose several labels without
     * overwriting the actors. */
    DYNAMIC_TEXT_OBJ_OAM_BASE = 96,
    DYNAMIC_TEXT_OBJ_OAM_COUNT = 32,
    /* Grow image HUDs in eight-entry blocks below dynamic text. The original
     * first eight slots stay at 88; unused blocks remain available to actors. */
    HUD_ICON_OBJ_OAM_BASE = 88,
    HUD_ICON_OBJ_OAM_COUNT = 32
};

_Static_assert(DYNAMIC_TEXT_OBJ_TILE_BASE + NAME_KEYBOARD_OBJ_GLYPH_OFFSET + NAME_KEYBOARD_OBJ_OAM_COUNT <= 1024, "Keyboard OBJ font overflow");
_Static_assert(NAME_INPUT_TILE_SELECTOR < 1023, "UI tiles overlap the blank sentinel");
_Static_assert(DYNAMIC_TEXT_OBJ_TILE_BASE + DYNAMIC_TEXT_OBJ_OAM_COUNT <= 1024, "OBJ font overflow");

static const uint16_t name_input_palette_colors[16] = {
    0x0000, 0x7FFF, 0x7BDE, 0x1862,
    0x1862, 0x03FF, 0x001F, 0x5FBE,
    0x4210, 0x7FFF, 0x24C3, 0x7BDE,
    0x0000, 0x0000, 0x0000, 0x0000
};

#define DMA_BASE 0x040000B0
#define TIMER_BASE 0x04000100
#define DMA_ENABLE 0x80000000u
#define DMA_32BIT 0x04000000u
#define DMA_DEST_FIXED 0x00400000u
#define DMA_REPEAT 0x02000000u
#define DMA_START_HBLANK 0x20000000u
#define DMA_START_SPECIAL 0x30000000u
#define TIMER_ENABLE 0x0080u
#define TIMER_IRQ 0x0040u
#define TIMER_CASCADE 0x0004u
#define SOUND_TRIGGER 0x8000u

extern void gbs_emit_vblank_interrupt(void);
extern void gbs_dispatch_hardware_interrupts(uint16_t hardware_mask);
extern void gbs_hw_irq_entry(void);
extern void gbs_bios_vblank_intr_wait(void);
extern int gbs_bios_cpu_fast_set(const void* source, void* destination, uint32_t word_count, int fill);

static void mark_shadow_oam_dirty(int first, int count) {
    if (first < 0) first = 0;
    if (first >= 128 || count <= 0) return;
    if (first + count > 128) count = 128 - first;
    const int last = first + count;
    if (shadow_oam_dirty_last == 0 || first < shadow_oam_dirty_first) {
        shadow_oam_dirty_first = (uint8_t)first;
    }
    if (last > shadow_oam_dirty_last) {
        shadow_oam_dirty_last = (uint8_t)last;
    }
}

static uint16_t interrupt_mask_for_source(int source) {
    switch (source) {
    case 0:
        return 1u << 0;
    case 1:
        return 1u << 3;
    case 2:
        return 1u << 4;
    case 3:
        return 1u << 5;
    case 4:
        return 1u << 6;
    case 5:
        return 1u << 12;
    case 6:
        return 1u << 1;
    default:
        return 0;
    }
}

void gbs_hw_irq_dispatch(void) {
    uint16_t pending = (uint16_t)(REG_IF & REG_IE);
    if (pending == 0) {
        return;
    }

    REG_IF = pending;
    BIOS_IRQ_FLAGS = (uint16_t)(BIOS_IRQ_FLAGS | pending);
    if ((pending & (1u << 12)) != 0) {
        keypad_irq_pending = 1;
    }
    if ((pending & 1u) != 0) {
        commit_pcm_stream_block();
        gbs_audio_vblank_update();
    }
    gbs_dispatch_hardware_interrupts(pending);
}

static volatile uint16_t* bg_control_register(int layer) {
    return (volatile uint16_t*)(0x04000008 + layer * 2);
}

static volatile uint16_t* affine_bg_matrix_registers(int layer) {
    if (layer == 2) {
        return &REG_BG2PA;
    }
    if (layer == 3) {
        return &REG_BG3PA;
    }
    return 0;
}

static volatile uint32_t* affine_bg_reference_registers(int layer) {
    if (layer == 2) {
        return &REG_BG2X;
    }
    if (layer == 3) {
        return &REG_BG3X;
    }
    return 0;
}

static volatile uint16_t* screenblock_address(uint32_t screenblock) {
    return (volatile uint16_t*)(0x06000000 + screenblock * 0x800);
}

static void gbs_hw_dma_wait(int channel) {
    if (channel < 0 || channel > 3) {
        return;
    }
    volatile uint32_t* dma = (volatile uint32_t*)(DMA_BASE + channel * 12);
    while ((dma[2] & DMA_ENABLE) != 0u) {
    }
}

static void commit_shadow_oam(void) {
    if (shadow_oam_dirty_last <= shadow_oam_dirty_first) {
        return;
    }
    const uint32_t first = shadow_oam_dirty_first;
    const uint32_t units = ((uint32_t)shadow_oam_dirty_last - first) * 4u;
    gbs_hw_dma_copy(3, shadow_oam + first * 4u, MEM_OAM + first * 4u, units, 0);
    shadow_oam_dirty_first = 128;
    shadow_oam_dirty_last = 0;
}

static void commit_shadow_oam_full(void) {
    gbs_hw_dma_copy(3, shadow_oam, MEM_OAM, 128u * 4u, 0);
    shadow_oam_dirty_first = 128;
    shadow_oam_dirty_last = 0;
}

static void commit_shadow_bg_tilemaps(void) {
    for (int layer = 0; layer < 4; ++layer) {
        if ((shadow_bg_tilemap_pending_mask & (1u << layer)) == 0) {
            continue;
        }
        if (layer == 0 && ui_character_base != 0) {
            for (unsigned i = 0; i < 1024; ++i) {
                if (shadow_bg_tilemaps[layer][i] == 0) shadow_bg_tilemaps[layer][i] = 1023;
            }
        }
        gbs_hw_dma_copy(
            3,
            shadow_bg_tilemaps[layer],
            screenblock_address(bg_screenblocks[layer]),
            32u * 32u,
            0
        );
    }
    shadow_bg_tilemap_pending_mask = 0;
}

static void commit_shadow_bg_scroll(void) {
    for (int layer = 0; layer < 4; ++layer) {
        if ((shadow_bg_scroll_pending_mask & (1u << layer)) == 0) {
            continue;
        }
        volatile uint16_t* scroll = (volatile uint16_t*)(0x04000010 + layer * 4);
        scroll[0] = shadow_bg_scroll_x[layer];
        scroll[1] = shadow_bg_scroll_y[layer];
    }
    shadow_bg_scroll_pending_mask = 0;
}

static void commit_shadow_bg_controls(void) {
    if (shadow_bg_enabled_pending) {
        REG_DISPCNT = (uint16_t)((REG_DISPCNT & ~0x0F00u) | (shadow_bg_enabled_bits & 0x0F00u));
        shadow_bg_enabled_pending = 0;
    }
    for (int layer = 0; layer < 4; ++layer) {
        const uint8_t layer_mask = (uint8_t)(1u << layer);
        if ((shadow_bg_character_base_pending_mask & layer_mask) == 0
            && (shadow_bg_depth_mask & layer_mask) == 0
            && (shadow_bg_screen_base_pending_mask & layer_mask) == 0
            && (shadow_bg_map_size_pending_mask & layer_mask) == 0
            && (shadow_bg_priority_pending_mask & layer_mask) == 0) {
            continue;
        }
        volatile uint16_t* control = bg_control_register(layer);
        uint16_t value = *control;
        if (shadow_bg_depth_mask & layer_mask) {
            value = (uint16_t)((value & ~(1u << 7)) | (shadow_bg_depth[layer] << 7));
        }
        if ((shadow_bg_screen_base_pending_mask & layer_mask) != 0) {
            value = (uint16_t)((value & ~(31u << 8)) | (bg_screenblocks[layer] << 8));
        }
        if ((shadow_bg_map_size_pending_mask & layer_mask) != 0) {
            value = (uint16_t)((value & ~(3u << 14)) | ((shadow_bg_map_size[layer] & 3u) << 14));
        }
        if ((shadow_bg_character_base_pending_mask & layer_mask) != 0) {
            value = (uint16_t)((value & ~(3u << 2)) | ((shadow_bg_character_base[layer] & 3u) << 2));
        }
        if ((shadow_bg_priority_pending_mask & layer_mask) != 0) {
            value = (uint16_t)((value & ~0x0003u) | (shadow_bg_priority[layer] & 3u));
        }
        *control = value;
    }
    shadow_bg_character_base_pending_mask = 0;
    shadow_bg_screen_base_pending_mask = 0;
    shadow_bg_map_size_pending_mask = 0;
    shadow_bg_priority_pending_mask = 0;
    shadow_bg_depth_mask = 0;
}

static void commit_hblank_bg_scroll(void) {
    if (!affine_hblank_enabled && !pending_hblank_scroll_enabled && !pending_hblank_scroll_dirty) {
        return;
    }
    gbs_hw_hdma_stop(0);
    if(affine_hblank_enabled) {
        if(pending_hblank_scroll_dirty) affine_hblank_active_buffer ^= 1u;
        const uint32_t* words=affine_hblank_words[affine_hblank_active_buffer];
        volatile uint32_t* registers=(volatile uint32_t*)(0x04000020u+(affine_hblank_layer-2u)*16u);
        for(unsigned i=0;i<4;++i)registers[i]=words[i];
        volatile uint32_t* dma=(volatile uint32_t*)DMA_BASE;
        dma[0]=(uint32_t)(words+4);
        dma[1]=(uint32_t)registers;
        /* Four words per HBlank, destination increment/reload, source increment. */
        dma[2]=4u|0x00600000u|DMA_REPEAT|DMA_START_HBLANK|DMA_32BIT|DMA_ENABLE;
        hblank_dma_active_mask=(uint8_t)(hblank_dma_active_mask|1u);
    } else if (pending_hblank_scroll_enabled && pending_hblank_scroll_offsets != 0) {
        volatile void* destination = (volatile void*)(0x04000010u + (uint32_t)pending_hblank_scroll_layer * 4u);
        gbs_hw_hdma_start(0, pending_hblank_scroll_offsets, destination, 1, 0);
    }
    pending_hblank_scroll_dirty = 0;
}

static void stage_room_tilemap8(int layer, const uint8_t* tiles, int width, int height, int camera_x, int camera_y) {
    int tile_x = camera_x / 8;
    int tile_y = camera_y / 8;
    uint16_t* shadow = shadow_bg_tilemaps[layer];

    for (int y = 0; y < 32; ++y) {
        for (int x = 0; x < 32; ++x) {
            int world_x = tile_x + x;
            int world_y = tile_y + y;
            uint16_t tile = 0;
            if (tiles != 0 && world_x >= 0 && world_y >= 0 && world_x < width && world_y < height) {
                tile = tiles[world_y * width + world_x];
            }
            shadow[y * 32 + x] = tile;
        }
    }
    shadow_bg_tilemap_pending_mask = (uint8_t)(shadow_bg_tilemap_pending_mask | (1u << layer));
}

static void stage_room_tilemap16(int layer, const uint16_t* tiles, int width, int height, int camera_x, int camera_y) {
    gbs_stage_room_tilemap16(shadow_bg_tilemaps[layer], tiles, width, height, camera_x, camera_y);
    shadow_bg_tilemap_pending_mask = (uint8_t)(shadow_bg_tilemap_pending_mask | (1u << layer));
}

static volatile uint16_t* bitmap16_address(uint16_t mode, uint16_t page) {
    if (mode == 5 && page == 1) {
        return (volatile uint16_t*)0x0600A000;
    }
    return MEM_VRAM;
}

static volatile uint16_t* bitmap8_address(uint16_t page) {
    if (page == 1) {
        return (volatile uint16_t*)0x0600A000;
    }
    return MEM_VRAM;
}

static uint16_t bitmap_mode_width_for_hardware(uint16_t mode) {
    return mode == 5 ? 160 : 240;
}

static uint16_t bitmap_mode_height_for_hardware(uint16_t mode) {
    return mode == 5 ? 128 : 160;
}

static uint32_t tilemap_block_index(uint32_t width, uint32_t height, uint32_t x, uint32_t y) {
    uint32_t block_x = x / 32;
    uint32_t block_y = y / 32;
    if (width > 32 && height > 32) {
        return block_y * 2 + block_x;
    }
    if (width > 32) {
        return block_x;
    }
    if (height > 32) {
        return block_y;
    }
    return 0;
}

static uint32_t screenblock_count_for_map_size(uint32_t map_size) {
    if (map_size == 0) {
        return 1;
    }
    if (map_size == 1 || map_size == 2) {
        return 2;
    }
    if (map_size == 3) {
        return 4;
    }
    return 0;
}

static uint32_t affine_screenblock_count_for_map_size(uint32_t map_size) {
    if (map_size == 0 || map_size == 1) {
        return 1;
    }
    if (map_size == 2) {
        return 2;
    }
    return 8;
}

static uint16_t square_frequency_value(uint16_t frequency_hz) {
    if (frequency_hz < 64) {
        frequency_hz = 64;
    }
    if (frequency_hz > 4095) {
        frequency_hz = 4095;
    }

    uint32_t value = 2048u - (131072u / frequency_hz);
    if (value > 2047u) {
        value = 2047u;
    }
    return (uint16_t)value;
}

static uint16_t wave_frequency_value(uint16_t frequency_hz) {
    if (frequency_hz < 64) {
        frequency_hz = 64;
    }
    if (frequency_hz > 2048) {
        frequency_hz = 2048;
    }

    uint32_t value = 2048u - (65536u / frequency_hz);
    if (value > 2047u) {
        value = 2047u;
    }
    return (uint16_t)value;
}

static void load_wave_pattern(uint8_t waveform) {
    REG_SOUND3CNT_L = 0;
    if (waveform == 1) {
        MEM_WAVE_RAM[0] = 0xAC986543u;
        MEM_WAVE_RAM[1] = 0xFFEDCBA9u;
        MEM_WAVE_RAM[2] = 0x345689ABu;
        MEM_WAVE_RAM[3] = 0x00123456u;
    } else if (waveform == 2) {
        MEM_WAVE_RAM[0] = 0x3333FFFFu;
        MEM_WAVE_RAM[1] = 0x3333FFFFu;
        MEM_WAVE_RAM[2] = 0x3333FFFFu;
        MEM_WAVE_RAM[3] = 0x3333FFFFu;
    } else if (waveform == 3) {
        MEM_WAVE_RAM[0] = 0x76543210u;
        MEM_WAVE_RAM[1] = 0xFEDCBA98u;
        MEM_WAVE_RAM[2] = 0x76543210u;
        MEM_WAVE_RAM[3] = 0xFEDCBA98u;
    } else {
        MEM_WAVE_RAM[0] = 0x67452301u;
        MEM_WAVE_RAM[1] = 0xEFCDAB89u;
        MEM_WAVE_RAM[2] = 0x98BADCFEu;
        MEM_WAVE_RAM[3] = 0x10325476u;
    }
}

static uint16_t duty_envelope_value(uint8_t volume, uint8_t duty) {
    if (volume > 15) {
        volume = 15;
    }
    if (duty > 3) {
        duty = 3;
    }
    return (uint16_t)((duty << 6) | (volume << 12));
}

static uint16_t noise_frequency_value(uint16_t frequency_hz) {
    if (frequency_hz < 64) {
        frequency_hz = 64;
    }
    if (frequency_hz > 4095) {
        frequency_hz = 4095;
    }

    uint16_t shift = 0;
    uint32_t scaled = frequency_hz;
    while (scaled > 256u && shift < 14u) {
        scaled >>= 1;
        ++shift;
    }
    uint16_t ratio = (uint16_t)(scaled / 32u);
    if (ratio > 7u) {
        ratio = 7u;
    }
    return (uint16_t)((shift << 4) | ratio);
}

static void write_demo_tile(unsigned tile_index, uint8_t color) {
    volatile uint16_t* tile = MEM_VRAM + (tile_index + (tile_index >= DIALOGUE_TILE_BLANK ? ui_character_base * 512u : 0u)) * 16;
    uint16_t packed = (uint16_t)(color | (color << 4) | (color << 8) | (color << 12));
    for (unsigned index = 0; index < 16; ++index) {
        tile[index] = packed;
    }
}

static uint16_t ui_tile_entry(unsigned tile_index, unsigned palette) {
    return (uint16_t)(tile_index | (palette << 12));
}

static uint16_t dialogue_tile_entry(unsigned tile_index) {
    return ui_tile_entry(tile_index, DIALOGUE_PALETTE);
}

static uint16_t name_input_tile_entry(unsigned tile_index) {
    return ui_tile_entry(tile_index, NAME_INPUT_BG_PALETTE);
}

static uint16_t name_input_glyph_tile_entry(unsigned tile_index) {
    return ui_tile_entry(tile_index, NAME_INPUT_TEXT_PALETTE);
}

static unsigned dialogue_bg_tile_for_codepoint(uint32_t codepoint);
static unsigned dialogue_obj_tile_for_codepoint(uint32_t codepoint, unsigned slot);
static uint16_t resident_font_glyphs[GBS_TEXT_RESIDENT_GLYPHS];
static uint8_t resident_font_slots[GBS_TEXT_GLYPH_COUNT];

static void rebuild_resident_font_slots(void) {
    for (unsigned glyph = 0; glyph < GBS_TEXT_GLYPH_COUNT; ++glyph)
        resident_font_slots[glyph] = 0xFFu;
    for (unsigned slot = 0; slot < GBS_TEXT_RESIDENT_GLYPHS; ++slot)
        resident_font_slots[resident_font_glyphs[slot]] = (uint8_t)slot;
}

static int dialogue_box_skin_active = 0;
static int hud_box_skin_active = 0;
static int dialogue_choice_selector_active = 0;
static const uint8_t* configured_dialogue_font_tiles = 0;
static int bg_font_transparent = 0;
static int hud_box_x = 0;
static int hud_box_y = 0;
static int hud_box_w = 32;
static int hud_box_h = 3;

#define HUD_LAYOUT_MAX_COMPONENTS 32
struct HudLayoutRect {
    int x;
    int y;
    int width;
    int height;
};
static struct HudLayoutRect hud_layout_previous_rects[HUD_LAYOUT_MAX_COMPONENTS];
static int hud_layout_previous_count = 0;
static int hud_layout_current_count = 0;
static unsigned hud_pixel_text_obj_count = 0;
static uint16_t hud_pixel_text_glyphs[1024 - DYNAMIC_TEXT_OBJ_TILE_BASE];

static void invalidate_hud_pixel_text_tiles(void) {
    for (unsigned i = 0; i < 1024 - DYNAMIC_TEXT_OBJ_TILE_BASE; ++i)
        hud_pixel_text_glyphs[i] = 0xFFFFu;
}

static void gbs_hw_mark_ui_tilemap_dirty(void) {
    shadow_bg_tilemap_pending_mask = (uint8_t)(shadow_bg_tilemap_pending_mask | (1u << UI_BACKGROUND_LAYER));
}

/* This is the C ABI view of gbs::MetaSprite and gbs::MetaSpritePart. Keep it
 * layout-compatible with engine/include/gbs/assets.hpp without making this
 * hardware translation unit depend on C++ headers. */
struct gbs_hw_metasprite_part {
    int8_t x;
    int8_t y;
    uint16_t tile_index;
    uint8_t palette;
    uint8_t hflip;
    uint8_t vflip;
    uint8_t width;
    uint8_t height;
};

struct gbs_hw_metasprite {
    const struct gbs_hw_metasprite_part* parts;
    uint8_t part_count;
};

void gbs_hw_configure_dialogue_box_skin(const uint8_t* tiles, const uint16_t* palette) {
    if (tiles == 0 || palette == 0) {
        dialogue_box_skin_active = 0;
        return;
    }
    gbs_hw_enqueue_vblank_dma16(tiles, MEM_VRAM + (ui_character_base * 512u + DIALOGUE_TILE_SKIN_BASE) * 16u, DIALOGUE_TILE_SKIN_COUNT * 16u);
    gbs_hw_load_bg_palette(palette, DIALOGUE_PALETTE_BASE, 16);
    gbs_hw_load_obj_palette(palette, DIALOGUE_PALETTE_BASE, 16);
    gbs_hw_flush_vram_writes();
    dialogue_box_skin_active = 1;
}

void gbs_hw_configure_hud_box_skin(const uint8_t* tiles, const uint16_t* palette) {
    if (tiles == 0 || palette == 0) {
        hud_box_skin_active = 0;
        return;
    }
    gbs_hw_enqueue_vblank_dma16(tiles, MEM_VRAM + (ui_character_base * 512u + HUD_TILE_SKIN_BASE) * 16u, HUD_TILE_SKIN_COUNT * 16u);
    gbs_hw_load_bg_palette(palette, HUD_PALETTE_BASE, 16);
    gbs_hw_flush_vram_writes();
    hud_box_skin_active = 1;
}

void gbs_hw_configure_hud_box(int x, int y, int width, int height) {
    if (width < 3) width = 3;
    if (width > 32) width = 32;
    if (height < 3) height = 3;
    if (height > 20) height = 20;
    if (x < 0) x = 0;
    if (x + width > 32) x = 32 - width;
    if (y < 0) y = 0;
    if (y + height > 32) y = 32 - height;
    hud_box_x = x;
    hud_box_y = y;
    hud_box_w = width;
    hud_box_h = height;
}

/* Maps a cell position within a box of size box_w x box_h to one of the 9
 * skin zones (raster order over a 3x3 grid): corners, edges and fill. */
static unsigned dialogue_box_skin_zone_index(int x, int y, int box_w, int box_h) {
    unsigned column = (x == 0) ? 0u : (x == box_w - 1) ? 2u : 1u;
    unsigned row = (y == 0) ? 0u : (y == box_h - 1) ? 2u : 1u;
    return row * 3u + column;
}

static uint16_t pack_font_pixels(uint8_t row, uint8_t start_pixel, uint8_t background_color, uint8_t text_color) {
    uint16_t packed = 0;
    for (uint8_t pixel = 0; pixel < 4; ++pixel) {
        uint8_t screen_pixel = (uint8_t)(start_pixel + pixel);
        uint8_t color = background_color;
        if ((row & (1u << (7u - screen_pixel))) != 0) color = text_color;
        packed |= (uint16_t)(color << (pixel * 4));
    }
    return packed;
}

static void write_glyph_tile(unsigned tile_index, const uint8_t rows[8]) {
    volatile uint16_t* tile = MEM_VRAM + (ui_character_base * 512u + tile_index) * 16u;
    for (uint8_t y = 0; y < 8; ++y) {
        uint8_t row = rows[y];
        tile[y * 2] = pack_font_pixels(row, 0, bg_font_transparent ? 0 : DIALOGUE_COLOR_BACKGROUND, DIALOGUE_COLOR_TEXT);
        tile[y * 2 + 1] = pack_font_pixels(row, 4, bg_font_transparent ? 0 : DIALOGUE_COLOR_BACKGROUND, DIALOGUE_COLOR_TEXT);
    }
}

static void write_obj_glyph_tile(unsigned tile_index, const uint8_t rows[8]) {
    volatile uint16_t* tile = MEM_OBJ_TILES + tile_index * 16;
    for (uint8_t y = 0; y < 8; ++y) {
        uint8_t row = rows[y];
        tile[y * 2] = pack_font_pixels(row, 0, 0, DIALOGUE_COLOR_TEXT);
        tile[y * 2 + 1] = pack_font_pixels(row, 4, 0, DIALOGUE_COLOR_TEXT);
    }
}

static void write_name_input_selector_tile(void) {
    static const uint8_t selector_glyph[7] = {
        0x04, 0x0C, 0x1C, 0x1F, 0x1C, 0x0C, 0x04
    };
    volatile uint16_t* tile = MEM_VRAM + (ui_character_base * 512u + NAME_INPUT_TILE_SELECTOR) * 16u;
    for (uint8_t y = 0; y < 8; ++y) {
        const uint8_t row = y < 7 ? (uint8_t)(selector_glyph[y] << 2) : 0;
        tile[y * 2] = pack_font_pixels(row, 0, NAME_INPUT_COLOR_BACKGROUND, NAME_INPUT_COLOR_SELECTOR);
        tile[y * 2 + 1] = pack_font_pixels(row, 4, NAME_INPUT_COLOR_BACKGROUND, NAME_INPUT_COLOR_SELECTOR);
    }
}

static void write_name_input_tiles(void) {
    write_demo_tile(NAME_INPUT_TILE_SURFACE, NAME_INPUT_COLOR_BACKGROUND);
    write_demo_tile(NAME_INPUT_TILE_BORDER, NAME_INPUT_COLOR_BORDER);
    write_name_input_selector_tile();
}

static void write_name_input_palette(void) {
    for (unsigned index = 0; index < 16; ++index) {
        MEM_PALETTE[256 + NAME_INPUT_OBJ_PALETTE_BASE + index] = name_input_palette_colors[index];
    }
}

/* Background palettes are uploaded through the VBlank DMA queue. Queue the
 * name-input palette after the background transfer so this dedicated light
 * surface keeps its own contrast on the following frame. */
static void queue_name_input_palette_restore(void) {
    gbs_hw_enqueue_vblank_dma16(
        name_input_palette_colors,
        MEM_PALETTE + 256 + NAME_INPUT_OBJ_PALETTE_BASE,
        16
    );
}

static void write_dialogue_tiles(void) {
    write_demo_tile(DIALOGUE_TILE_BLANK, DIALOGUE_COLOR_BACKGROUND);
    write_demo_tile(DIALOGUE_TILE_BORDER, 4);
    for (unsigned index = 0; index < GBS_TEXT_RESIDENT_GLYPHS; ++index) {
        write_glyph_tile(DIALOGUE_TILE_GLYPH_BASE + index, gbs_font_rows[resident_font_glyphs[index]]);
    }
    static const uint8_t selector_glyph[8] = { 0x40, 0x60, 0x70, 0x7C, 0x70, 0x60, 0x40, 0 };
    write_glyph_tile(DIALOGUE_TILE_SELECTOR, selector_glyph);
}

static void write_obj_dialogue_tiles(void) {
    /* OBJ text uses one tile per visible OAM slot, loaded when drawn. */
    MEM_PALETTE[256 + DIALOGUE_PALETTE_BASE + DIALOGUE_COLOR_TEXT] = 0x7FFF;
}

static uint8_t dialogue_font_bg_byte(uint8_t value) {
    uint8_t low = value & 0x0F;
    uint8_t high = (value >> 4) & 0x0F;
    /* The authored font contract is binary: zero is transparent/background
     * and every non-zero source nibble is the foreground glyph. Remap the
     * latter to the active dialogue text slot instead of leaking the PNG's
     * palette index into the GBA UI palette. */
    low = low == 0 ? (bg_font_transparent ? 0 : DIALOGUE_COLOR_BACKGROUND) : DIALOGUE_COLOR_TEXT;
    high = high == 0 ? (bg_font_transparent ? 0 : DIALOGUE_COLOR_BACKGROUND) : DIALOGUE_COLOR_TEXT;
    return (uint8_t)(low | (high << 4));
}

static void load_resident_font_glyph(unsigned slot, unsigned glyph) {
    if (configured_dialogue_font_tiles == 0) {
        write_glyph_tile(DIALOGUE_TILE_GLYPH_BASE + slot, gbs_font_rows[glyph]);
        return;
    }
    const uint8_t* source = configured_dialogue_font_tiles + glyph * 32;
    volatile uint16_t* target = MEM_VRAM + (ui_character_base * 512u + DIALOGUE_TILE_GLYPH_BASE + slot) * 16u;
    for (unsigned i = 0; i < 16; ++i) {
        target[i] = (uint16_t)(dialogue_font_bg_byte(source[i * 2]) |
            ((uint16_t)dialogue_font_bg_byte(source[i * 2 + 1]) << 8));
    }
}

static unsigned dialogue_bg_tile_for_codepoint(uint32_t codepoint) {
    const unsigned glyph = gbs_text_glyph_index(codepoint);
    const unsigned resident = resident_font_slots[glyph];
    if (resident < GBS_TEXT_RESIDENT_GLYPHS)
        return DIALOGUE_TILE_GLYPH_BASE + resident;
    uint8_t pinned[GBS_TEXT_RESIDENT_GLYPHS] = {0};
    /* Never evict a glyph still referenced by the HUD, name box or dialogue. */
    for (unsigned i = 0; i < 1024; ++i) {
        const unsigned tile = shadow_bg_tilemaps[UI_BACKGROUND_LAYER][i] & 1023u;
        if (tile >= DIALOGUE_TILE_GLYPH_BASE && tile < DIALOGUE_TILE_SELECTOR)
            pinned[tile - DIALOGUE_TILE_GLYPH_BASE] = 1;
    }
    const int slot = gbs_text_cache_slot(resident_font_glyphs, pinned, glyph);
    if (slot < 0) return DIALOGUE_TILE_GLYPH_BASE + 42;
    /* Refresh both directions after eviction, preserving visible glyph pins. */
    rebuild_resident_font_slots();
    load_resident_font_glyph((unsigned)slot, glyph);
    return DIALOGUE_TILE_GLYPH_BASE + (unsigned)slot;
}

static unsigned dialogue_obj_tile_for_codepoint(uint32_t codepoint, unsigned slot) {
    const unsigned glyph = gbs_text_glyph_index(codepoint);
    const unsigned tile = DYNAMIC_TEXT_OBJ_TILE_BASE + slot;
    if (slot < 1024 - DYNAMIC_TEXT_OBJ_TILE_BASE) hud_pixel_text_glyphs[slot] = 0xFFFFu;
    if (configured_dialogue_font_tiles == 0) {
        write_obj_glyph_tile(tile, gbs_font_rows[glyph]);
    } else {
        const uint8_t* source = configured_dialogue_font_tiles + glyph * 32;
        volatile uint16_t* target = MEM_OBJ_TILES + tile * 16u;
        for (unsigned i = 0; i < 16; ++i)
            target[i] = (uint16_t)(source[i * 2] | ((uint16_t)source[i * 2 + 1] << 8));
    }
    return tile;
}

static void load_custom_dialogue_font(const uint8_t* tiles) {
    (void)tiles;
    for (unsigned slot = 0; slot < GBS_TEXT_RESIDENT_GLYPHS; ++slot) {
        load_resident_font_glyph(slot, resident_font_glyphs[slot]);
    }
}

void gbs_hw_set_bg_font_transparent(int enabled) {
    enabled = enabled != 0;
    if (bg_font_transparent == enabled) return;
    bg_font_transparent = enabled;
    for (unsigned slot = 0; slot < GBS_TEXT_RESIDENT_GLYPHS; ++slot) {
        load_resident_font_glyph(slot, resident_font_glyphs[slot]);
    }
}

void gbs_hw_configure_dialogue_font(const uint8_t* tiles) {
    invalidate_hud_pixel_text_tiles();
    bg_font_transparent = 0;
    configured_dialogue_font_tiles = tiles;
    if (tiles == 0) {
        for (unsigned index = 0; index < GBS_TEXT_RESIDENT_GLYPHS; ++index) {
            write_glyph_tile(DIALOGUE_TILE_GLYPH_BASE + index, gbs_font_rows[resident_font_glyphs[index]]);
        }
        write_obj_dialogue_tiles();
        return;
    }
    load_custom_dialogue_font(tiles);
}

void gbs_hw_configure_dialogue_choice_selector(const uint8_t* tile) {
    if (tile == 0) {
        dialogue_choice_selector_active = 0;
        return;
    }
    gbs_hw_enqueue_vblank_dma16(tile, MEM_VRAM + (ui_character_base * 512u + DIALOGUE_TILE_SELECTOR) * 16u, 16u);
    dialogue_choice_selector_active = 1;
}

static void write_obj_square_tiles(void) {
    for (unsigned tile = 0; tile < 4; ++tile) {
        volatile uint16_t* data = MEM_OBJ_TILES + tile * 16;
        for (unsigned index = 0; index < 16; ++index) {
            data[index] = 0x2222;
        }
    }
}

void gbs_hw_init(void) {
    invalidate_hud_pixel_text_tiles();
    for (unsigned i = 0; i < GBS_TEXT_RESIDENT_GLYPHS; ++i) resident_font_glyphs[i] = (uint16_t)i;
    rebuild_resident_font_slots();
    bg_screenblocks[0] = 24;
    bg_screenblocks[1] = 28;
    bg_screenblocks[2] = 20;
    bg_screenblocks[3] = 16;
    shadow_bg_screen_base_pending_mask = 0;
    shadow_bg_map_size_pending_mask = 0;
    shadow_bg_map_size[0] = 0;
    shadow_bg_map_size[1] = 0;
    shadow_bg_map_size[2] = 0;
    shadow_bg_map_size[3] = 0;
    REG_IME = 0;
    REG_IE = 0;
    REG_IF = 0xFFFF;
    BIOS_IRQ_FLAGS = 0;
    keypad_irq_pending = 0;
    MEM_IRQ_HANDLER = gbs_hw_irq_entry;
    /* BG2/BG3 are optional layers; runtimes enable them explicitly when used. */
    REG_DISPCNT = (1u << 6) | (1u << 8) | (1u << 9) | (1u << 12);
    shadow_bg_enabled_bits = (uint16_t)(REG_DISPCNT & 0x0F00u);
    shadow_bg_enabled_pending = 0;
    if (render_publication_blocked) {
        gbs_hw_set_render_handoff_fallback();
    }
    shadow_bg_character_base_pending_mask = 0;
    shadow_bg_priority_pending_mask = 0;
    /* Priority 0 draws in front. UI on BG0, world room on BG1. */
    ui_character_base = 0;
    shadow_bg_depth_mask = 0;
    REG_BG0CNT = (uint16_t)((bg_screenblocks[UI_BACKGROUND_LAYER] << 8) | 0);
    REG_BG1CNT = (uint16_t)((bg_screenblocks[WORLD_BACKGROUND_LAYER] << 8) | 1);
    REG_BG2CNT = (uint16_t)((bg_screenblocks[2] << 8) | 2);
    REG_BG3CNT = (uint16_t)((bg_screenblocks[3] << 8) | 3);
    gbs_hw_disable_blending();
    gbs_hw_disable_mosaic();
    gbs_hw_set_window0(0, 240, 0, 160, 0x3F, 0x3F, 0);
    gbs_hw_set_window1(0, 240, 0, 160, 0x3F, 0x3F, 0);
    gbs_hw_set_obj_window(0x3F, 0x3F, 0);
    gbs_hw_set_backdrop(0x0000);
    gbs_hw_demo_tiles();
    /* Clear UI layer to transparent tile 0 so the world BG shows through. */
    {
        uint16_t* shadow_ui_map = shadow_bg_tilemaps[UI_BACKGROUND_LAYER];
        volatile uint16_t* ui_map = screenblock_address(bg_screenblocks[UI_BACKGROUND_LAYER]);
        for (unsigned index = 0; index < 32u * 32u; ++index) {
            shadow_ui_map[index] = 0;
            ui_map[index] = 0;
        }
    }
    gbs_hw_hide_all_sprites();
    commit_shadow_oam_full();
    for (int layer = 0; layer < 4; ++layer) {
        shadow_bg_scroll_x[layer] = 0;
        shadow_bg_scroll_y[layer] = 0;
        shadow_bg_scroll_pending_mask = (uint8_t)(shadow_bg_scroll_pending_mask | (1u << layer));
    }
    commit_shadow_bg_scroll();
    affine_hblank_enabled=0;
    affine_hblank_active_buffer=0;
    pending_hblank_scroll_offsets = 0;
    pending_hblank_scroll_layer = 0;
    pending_hblank_scroll_enabled = 0;
    pending_hblank_scroll_dirty = 1;
    commit_hblank_bg_scroll();
    REG_DISPSTAT = (uint16_t)(REG_DISPSTAT | (1u << 3));
    REG_IE = (uint16_t)(REG_IE | (1u << 0));
    REG_IME = 1;
}

void gbs_hw_wait_vblank(void) {
    if ((REG_IE & (1u << 0)) != 0 && (REG_DISPSTAT & (1u << 3)) != 0) {
        gbs_bios_vblank_intr_wait();
    } else {
        while (REG_VCOUNT >= 160) {
        }
        while (REG_VCOUNT < 160) {
        }
    }
    if (!render_publication_blocked) {
        commit_shadow_bg_controls();
        commit_shadow_oam();
        commit_shadow_bg_tilemaps();
        commit_shadow_bg_scroll();
        commit_hblank_bg_scroll();
        if (render_handoff_fallback_active) {
            REG_DISPCNT = (uint16_t)(
                (REG_DISPCNT & ~0x0F00u)
                | (shadow_bg_enabled_bits & 0x0F00u)
                | (1u << 12)
            );
            render_handoff_fallback_active = 0;
        }
    }
    if ((REG_IE & (1u << 0)) == 0) {
        commit_pcm_stream_block();
        gbs_audio_vblank_update();
        gbs_emit_vblank_interrupt();
    }
}

void gbs_hw_set_render_publication_blocked(int blocked) {
    render_publication_blocked = blocked != 0 ? 1 : 0;
}

void gbs_hw_set_render_handoff_fallback(void) {
    /* Mode 0 with no BG/OBJ layers guarantees a deterministic black frame
     * while the next runtime rebuilds VRAM, tilemaps and OAM. The display
     * output is restored from the staged BG mask on a later VBlank. */
    REG_DISPCNT = (1u << 6);
    MEM_PALETTE[0] = 0;
    REG_BLDCNT = 0;
    REG_BLDALPHA = 0;
    REG_BLDY = 0;
    REG_MOSAIC = 0;
    render_handoff_fallback_active = 1;
}

void gbs_hw_flush_vram_writes(void) {
    gbs_hw_flush_vblank_dma_queue(3);
    gbs_hw_dma_wait(3);
}

void gbs_hw_frame_counter_init(void) {
    volatile uint16_t* timer2 = (volatile uint16_t*)(TIMER_BASE + 2 * 4);
    volatile uint16_t* timer3 = (volatile uint16_t*)(TIMER_BASE + 3 * 4);
    timer2[1] = 0;
    timer3[1] = 0;
    timer2[0] = 0;
    timer3[0] = 0;
    timer3[1] = (uint16_t)(TIMER_CASCADE | TIMER_ENABLE);
    timer2[1] = (uint16_t)(1u | TIMER_ENABLE);
}

uint32_t gbs_hw_frame_counter_ticks(void) {
    volatile uint16_t* timer2 = (volatile uint16_t*)(TIMER_BASE + 2 * 4);
    volatile uint16_t* timer3 = (volatile uint16_t*)(TIMER_BASE + 3 * 4);
    uint16_t high_before;
    uint16_t low;
    uint16_t high_after;
    do {
        high_before = timer3[0];
        low = timer2[0];
        high_after = timer3[0];
    } while (high_before != high_after);
    return ((uint32_t)high_after << 16) | low;
}

void gbs_hw_enable_interrupt_source(int source) {
    uint16_t mask = interrupt_mask_for_source(source);
    if (mask == 0) {
        return;
    }
    REG_IME = 0;
    if (source == 0) {
        REG_DISPSTAT = (uint16_t)(REG_DISPSTAT | (1u << 3));
    } else if (source == 5) {
        REG_KEYCNT = (uint16_t)(0x03FFu | (1u << 14));
    } else if (source == 6) {
        REG_DISPSTAT = (uint16_t)(REG_DISPSTAT | (1u << 4));
    }
    REG_IF = mask;
    REG_IE = (uint16_t)(REG_IE | mask);
    REG_IME = 1;
}

void gbs_hw_disable_interrupt_source(int source) {
    uint16_t mask = interrupt_mask_for_source(source);
    if (mask == 0) {
        return;
    }

    REG_IME = 0;
    REG_IE = (uint16_t)(REG_IE & ~mask);
    if (source == 0) {
        REG_DISPSTAT = (uint16_t)(REG_DISPSTAT & ~(1u << 3));
    } else if (source == 5) {
        REG_KEYCNT = (uint16_t)(REG_KEYCNT & ~(1u << 14));
    } else if (source == 6) {
        REG_DISPSTAT = (uint16_t)(REG_DISPSTAT & ~(1u << 4));
    }
    REG_IF = mask;
    REG_IME = 1;
}

void gbs_hw_sio_normal8_init(int internal_clock) {
    REG_RCNT = 0;
    REG_SIODATA8 = 0xFFFF;
    REG_SIOCNT = (uint16_t)((internal_clock ? 0x0001u : 0u) | 0x0008u);
}

int gbs_hw_sio_normal8_transfer(uint8_t outgoing, int internal_clock, uint32_t timeout_frames, uint8_t* incoming) {
    if (incoming == 0) {
        return 0;
    }

    REG_RCNT = 0;
    REG_SIODATA8 = outgoing;
    REG_SIOCNT = (uint16_t)((internal_clock ? 0x0001u : 0u) | 0x0008u | 0x0080u);

    uint32_t timeout = timeout_frames == 0 ? 1u : timeout_frames;
    timeout *= 280896u;
    while ((REG_SIOCNT & 0x0080u) != 0) {
        if (timeout == 0) {
            *incoming = 0;
            return 0;
        }
        --timeout;
    }

    *incoming = (uint8_t)(REG_SIODATA8 & 0x00FFu);
    return 1;
}

int gbs_hw_sio_normal32_transfer(uint32_t outgoing, int internal_clock, uint32_t timeout_frames, uint32_t* incoming) {
    if (incoming == 0) {
        return 0;
    }

    REG_RCNT = 0;
    REG_SIODATA32 = outgoing;
    REG_SIOCNT = (uint16_t)((internal_clock ? 0x0001u : 0u) | 0x0080u);

    uint32_t timeout = timeout_frames == 0 ? 1u : timeout_frames;
    timeout *= 280896u;
    while ((REG_SIOCNT & 0x0080u) != 0) {
        if (timeout == 0) {
            *incoming = 0;
            return 0;
        }
        --timeout;
    }

    *incoming = REG_SIODATA32;
    return 1;
}

int gbs_hw_sio_multiplayer_init(void) {
    REG_RCNT = 0;
    REG_SIOMLT_SEND = 0xFFFFu;
    /* Multiplayer mode (bits 12-13 = 10), 115200 bps (bits 0-1 = 11). */
    REG_SIOCNT = 0x2003u;
    return 1;
}

int gbs_hw_sio_multiplayer_transfer(uint16_t outgoing, uint32_t timeout_frames,
                                    uint16_t received[4], uint8_t* player_id,
                                    uint8_t* connected_mask) {
    if (received == 0 || player_id == 0 || connected_mask == 0) return 0;
    REG_SIOMLT_SEND = outgoing;
    const uint8_t local_id = (uint8_t)((REG_SIOCNT >> 4) & 0x03u);
    if (local_id == 0) REG_SIOCNT = (uint16_t)(REG_SIOCNT | 0x0080u);

    uint32_t timeout = timeout_frames == 0 ? 1u : timeout_frames;
    timeout *= 280896u;
    while ((REG_SIOCNT & 0x0080u) != 0) {
        if (timeout == 0) return 0;
        --timeout;
    }
    if ((REG_SIOCNT & 0x0040u) != 0) return 0;

    received[0] = REG_SIOMULTI0;
    received[1] = REG_SIOMULTI1;
    received[2] = REG_SIOMULTI2;
    received[3] = REG_SIOMULTI3;
    uint8_t mask = 0;
    for (uint8_t index = 0; index < 4; ++index) {
        if (received[index] != 0xFFFFu) mask = (uint8_t)(mask | (1u << index));
    }
    *player_id = local_id;
    *connected_mask = mask;
    return 1;
}

void gbs_hw_sio_close(void) {
    REG_SIOCNT = 0;
    REG_RCNT = 0;
    REG_SIODATA8 = 0xFFFF;
}

void gbs_hw_set_backdrop(uint16_t color) {
    MEM_PALETTE[0] = color;
}

uint16_t gbs_hw_get_backdrop(void) {
    return MEM_PALETTE[0];
}

void gbs_hw_audio_init(void) {
    REG_SOUNDCNT_X = 0x0080;
    REG_SOUNDCNT_L = 0xFF77;
    REG_SOUNDCNT_H = 0x0002;
    gbs_hw_audio_stop_square(1);
    gbs_hw_audio_stop_square(2);
    load_wave_pattern(0);
    gbs_hw_audio_stop_wave();
    gbs_hw_audio_stop_noise();
    gbs_hw_audio_stop_pcm();
    pcm_dma_block_started = 0;
    pcm_underrun_count = 0;
}

uint16_t gbs_hw_read_keys(void) {
    return (uint16_t)(~REG_KEYINPUT & 0x03FF);
}

int gbs_hw_consume_keypad_irq(void) {
    if (keypad_irq_pending == 0) {
        return 0;
    }
    keypad_irq_pending = 0;
    return 1;
}

int gbs_hw_keypad_irq_pending(void) {
    return keypad_irq_pending != 0;
}

void gbs_hw_clear_keypad_irq(void) {
    keypad_irq_pending = 0;
}

void gbs_hw_set_bg_scroll(int layer, int x, int y) {
    if (layer < 0 || layer > 3) {
        return;
    }

    shadow_bg_scroll_x[layer] = (uint16_t)x;
    shadow_bg_scroll_y[layer] = (uint16_t)y;
    shadow_bg_scroll_pending_mask = (uint8_t)(shadow_bg_scroll_pending_mask | (1u << layer));
}

void gbs_hw_set_bg_character_base(int layer, uint16_t character_base) {
    if (layer < 0 || layer > 3 || character_base > 3u) {
        return;
    }
    const uint8_t layer_mask = (uint8_t)(1u << layer);
    if ((shadow_bg_character_base_pending_mask & layer_mask) == 0) {
        shadow_bg_character_base[layer] = (uint8_t)((*bg_control_register(layer) >> 2) & 3u);
    }
    shadow_bg_character_base[layer] = (uint8_t)character_base;
    shadow_bg_character_base_pending_mask = (uint8_t)(shadow_bg_character_base_pending_mask | layer_mask);
}

void gbs_hw_set_bg_screen_base(int layer, uint16_t screen_base) {
    if (layer < 0 || layer > 3 || screen_base > 31u || bg_screenblocks[layer] == screen_base) return;
    bg_screenblocks[layer] = screen_base;
    shadow_bg_screen_base_pending_mask |= (uint8_t)(1u << layer);
}

void gbs_hw_set_bg_color_depth(int layer, int indexed) {
    if (layer < 0 || layer > 3) return;
    shadow_bg_depth[layer] = indexed != 0;
    shadow_bg_depth_mask |= (uint8_t)(1u << layer);
}

void gbs_hw_set_ui_character_base(uint16_t base) {
    if (base > 2u || base == ui_character_base) return;
    gbs_hw_flush_vram_writes();
    volatile uint16_t* source = MEM_VRAM + (ui_character_base * 512u + DIALOGUE_TILE_BLANK) * 16u;
    volatile uint16_t* target = MEM_VRAM + (base * 512u + DIALOGUE_TILE_BLANK) * 16u;
    for (unsigned i = 0; i < (1024u - DIALOGUE_TILE_BLANK) * 16u; ++i) target[i] = source[i];
    ui_character_base = base;
    for (unsigned i = 0; i < 16; ++i) MEM_VRAM[(base * 512u + 1023u) * 16u + i] = 0;
    for (unsigned i = 0; i < 1024; ++i) {
        if (shadow_bg_tilemaps[0][i] == 1023) shadow_bg_tilemaps[0][i] = 0;
    }
    shadow_bg_tilemap_pending_mask |= 1u;
    gbs_hw_set_bg_character_base(UI_BACKGROUND_LAYER, base);
}

void gbs_hw_load_bg_tiles_8bpp(const uint8_t* data, uint32_t tile, uint32_t count, uint16_t base) {
    if (data == 0 || count == 0 || base > 2u || tile >= 768u ||
        count > 768u - tile || base * 256u + tile + count > 768u) return;
    // The DMA queue accepts at most 0x3fff halfwords per transfer.
    // A 240x160 indexed viewport is larger, so submit complete tile chunks.
    while (count > 0) {
        const uint32_t chunk = count > 511u ? 511u : count;
        gbs_hw_enqueue_vblank_dma16(data, MEM_VRAM + (base * 256u + tile) * 32u, chunk * 32u);
        data += chunk * 64u;
        tile += chunk;
        count -= chunk;
    }
}

void gbs_hw_load_bg_tiles_at_character_base(const uint8_t* data, uint32_t destination_tile, uint32_t tile_count, uint16_t character_base) {
    if (data == 0 || tile_count == 0 || character_base > 2u ||
        destination_tile >= 1024u || tile_count > 1024u - destination_tile ||
        character_base * 512u + destination_tile + tile_count > 1536u) return;
    gbs_hw_enqueue_vblank_dma16(data,
        MEM_VRAM + (character_base * 512u + destination_tile) * 16u,
        tile_count * 16u);
}

void gbs_hw_set_bg_enabled(int layer, int enabled) {
    if (layer < 0 || layer > 3) {
        return;
    }
    const uint16_t mask = (uint16_t)(1u << (8 + layer));
    if (!shadow_bg_enabled_pending) {
        if (!render_publication_blocked) {
            shadow_bg_enabled_bits = (uint16_t)(REG_DISPCNT & 0x0F00u);
        }
    }
    if (enabled) {
        shadow_bg_enabled_bits = (uint16_t)(shadow_bg_enabled_bits | mask);
    } else {
        shadow_bg_enabled_bits = (uint16_t)(shadow_bg_enabled_bits & ~mask);
    }
    shadow_bg_enabled_pending = 1;
}

static int gbs_hw_hud_icon_slot(int ordinal) {
    return HUD_ICON_OBJ_OAM_BASE - (ordinal / 8) * 8 + ordinal % 8;
}

static int gbs_hw_hud_icon_owns_slot(int index) {
    if (hud_icon_obj_write || index < HUD_ICON_OBJ_OAM_BASE - HUD_ICON_OBJ_OAM_COUNT + 8 || index >= HUD_ICON_OBJ_OAM_BASE + 8) return 0;
    const int ordinal = ((HUD_ICON_OBJ_OAM_BASE + 7 - index) / 8) * 8 + index % 8;
    return ordinal < hud_icon_obj_count;
}

void gbs_hw_hide_sprites(int first, int count) {
    if (first < 0) first = 0;
    if (first >= 128 || count <= 0) return;
    if (first + count > 128) count = 128 - first;
    for (int index = first; index < first + count; ++index) {
        if (gbs_hw_hud_icon_owns_slot(index)) continue;
        /* ATTR0 bits 8-9 = 2 explicitly disable the OBJ entry. */
        shadow_oam[index * 4 + 0] = (2u << 8);
        shadow_oam[index * 4 + 1] = 0;
        shadow_oam[index * 4 + 2] = 0;
        shadow_oam[index * 4 + 3] = 0;
    }
    mark_shadow_oam_dirty(first, count);
}

void gbs_hw_hide_all_sprites(void) {
    hud_icon_obj_count = 0;
    gbs_hw_hide_sprites(0, 128);
}

void gbs_hw_set_sprite(int index, int x, int y, uint16_t tile_index, uint16_t palette, int hflip, int vflip, int visible, uint16_t priority, uint16_t mode, int mosaic, uint16_t shape, uint16_t size) {
    if (index < 0 || index >= 128) {
        ++oam_overflow_count;
        return;
    }
    if (gbs_hw_hud_icon_owns_slot(index)) return;

    if (!visible) {
        shadow_oam[index * 4 + 0] = (2u << 8);
        shadow_oam[index * 4 + 1] = 0;
        shadow_oam[index * 4 + 2] = 0;
        shadow_oam[index * 4 + 3] = 0;
        mark_shadow_oam_dirty(index, 1);
        return;
    }

    shadow_oam[index * 4 + 0] = (uint16_t)((y & 0x00FF) | ((mode & 3u) << 10) | (mosaic ? (1u << 12) : 0) | ((shape & 3u) << 14));
    shadow_oam[index * 4 + 1] = (uint16_t)((x & 0x01FF) | (hflip ? (1u << 12) : 0) | (vflip ? (1u << 13) : 0) | ((size & 3u) << 14));
    shadow_oam[index * 4 + 2] = (uint16_t)(tile_index | ((priority & 3u) << 10) | ((palette & 15u) << 12));
    mark_shadow_oam_dirty(index, 1);
}

void gbs_hw_set_sprite_color_depth(int index, int eight_bpp) {
    if (index < 0 || index >= 128) {
        ++oam_overflow_count;
        return;
    }
    if (gbs_hw_hud_icon_owns_slot(index)) return;
    if (eight_bpp) {
        shadow_oam[index * 4 + 0] = (uint16_t)(shadow_oam[index * 4 + 0] | (1u << 13));
    } else {
        shadow_oam[index * 4 + 0] = (uint16_t)(shadow_oam[index * 4 + 0] & ~(1u << 13));
    }
    mark_shadow_oam_dirty(index, 1);
}

void gbs_hw_set_sprite_affine(int index, int enabled, int double_size, uint16_t matrix_index) {
    if (index < 0 || index >= 128 || matrix_index >= 32) {
        ++oam_overflow_count;
        return;
    }
    if (gbs_hw_hud_icon_owns_slot(index)) return;
    uint16_t attr0 = shadow_oam[index * 4 + 0];
    uint16_t attr1 = shadow_oam[index * 4 + 1];
    if (enabled) {
        attr0 = (uint16_t)(attr0 & ~((1u << 8) | (1u << 9)));
        attr1 = (uint16_t)(attr1 & ~(31u << 9));
        attr0 = (uint16_t)(attr0 | (1u << 8) | (double_size ? (1u << 9) : 0));
        attr1 = (uint16_t)(attr1 | ((matrix_index & 31u) << 9));
    } else {
        attr0 = (uint16_t)(attr0 & ~(1u << 8));
    }
    shadow_oam[index * 4 + 0] = attr0;
    shadow_oam[index * 4 + 1] = attr1;
    mark_shadow_oam_dirty(index, 1);
}

void gbs_hw_set_sprite_affine_matrix(uint16_t matrix_index, int16_t pa, int16_t pb, int16_t pc, int16_t pd) {
    if (matrix_index >= 32) {
        return;
    }
    const uint32_t base = (uint32_t)matrix_index * 16u;
    shadow_oam[base + 3] = (uint16_t)pa;
    shadow_oam[base + 7] = (uint16_t)pb;
    shadow_oam[base + 11] = (uint16_t)pc;
    shadow_oam[base + 15] = (uint16_t)pd;
    mark_shadow_oam_dirty((int)matrix_index * 4, 4);
}

uint32_t gbs_hw_oam_overflow_count(void) {
    return oam_overflow_count;
}

void gbs_hw_reset_oam_overflow_count(void) {
    oam_overflow_count = 0;
}

void gbs_hw_demo_tiles(void) {
    MEM_PALETTE[0] = 0x0000;
    MEM_PALETTE[1] = 0x4210;
    MEM_PALETTE[2] = 0x03FF;
    MEM_PALETTE[3] = 0x021F;
    MEM_PALETTE[4] = 0x7FFF;
    MEM_PALETTE[5] = 0x0841;
    MEM_PALETTE[DIALOGUE_PALETTE_BASE + DIALOGUE_COLOR_BACKGROUND] = 0x0000;
    MEM_PALETTE[DIALOGUE_PALETTE_BASE + 4] = 0x7FFF;
    MEM_PALETTE[HUD_PALETTE_BASE + DIALOGUE_COLOR_BACKGROUND] = 0x0000;
    MEM_PALETTE[HUD_PALETTE_BASE + DIALOGUE_COLOR_TEXT] = 0x7FFF;
    write_name_input_palette();
    MEM_PALETTE[16] = 0x0000;
    MEM_PALETTE[17] = 0x7C00;
    MEM_PALETTE[18] = 0x001F;

    write_demo_tile(0, 0);
    write_demo_tile(1, 1);
    write_demo_tile(2, 3);
    write_demo_tile(3, 4);
    write_dialogue_tiles();
    write_name_input_tiles();
    write_obj_square_tiles();
}

void gbs_hw_restore_ui_assets(void) {
    MEM_PALETTE[DIALOGUE_PALETTE_BASE + DIALOGUE_COLOR_BACKGROUND] = 0x0000;
    MEM_PALETTE[DIALOGUE_PALETTE_BASE + DIALOGUE_COLOR_TEXT] = 0x7FFF;
    MEM_PALETTE[HUD_PALETTE_BASE + DIALOGUE_COLOR_BACKGROUND] = 0x0000;
    MEM_PALETTE[HUD_PALETTE_BASE + DIALOGUE_COLOR_TEXT] = 0x7FFF;
    write_name_input_palette();
    write_dialogue_tiles();
    if (configured_dialogue_font_tiles != 0) {
        load_custom_dialogue_font(configured_dialogue_font_tiles);
    }
    write_name_input_tiles();
    write_obj_dialogue_tiles();
}

void gbs_hw_load_bg_palette(const uint16_t* colors, uint32_t start_index, uint32_t color_count) {
    if (colors == 0 || color_count == 0 || start_index + color_count > 256) {
        return;
    }
    gbs_hw_enqueue_vblank_dma16(colors, MEM_PALETTE + start_index, color_count);
}

void gbs_hw_load_obj_palette(const uint16_t* colors, uint32_t start_index, uint32_t color_count) {
    if (colors == 0 || color_count == 0 || start_index + color_count > 256) {
        return;
    }
    gbs_hw_enqueue_vblank_dma16(colors, MEM_PALETTE + 256 + start_index, color_count);
}

void gbs_hw_load_bg_tiles(const uint8_t* data, uint32_t destination_tile, uint32_t tile_count) {
    if (data == 0 || tile_count == 0 || destination_tile + tile_count > 1024) {
        return;
    }
    gbs_hw_enqueue_vblank_dma16(data, MEM_VRAM + destination_tile * 16, tile_count * 16);
}

void gbs_hw_load_obj_tiles(const uint8_t* data, uint32_t destination_tile, uint32_t tile_count) {
    if (data == 0 || tile_count == 0 || destination_tile + tile_count > 1024) {
        return;
    }
    if (destination_tile + tile_count > DYNAMIC_TEXT_OBJ_TILE_BASE) invalidate_hud_pixel_text_tiles();
    gbs_hw_enqueue_vblank_dma16(data, MEM_OBJ_TILES + destination_tile * 16, tile_count * 16);
}

void gbs_hw_load_obj_tiles_8bpp(const uint8_t* data, uint32_t destination_tile, uint32_t tile_count) {
    if (data == 0 || tile_count == 0 || (destination_tile & 1u) != 0 ||
        destination_tile >= 1024u || destination_tile + tile_count * 2u > 1024u) {
        return;
    }
    if (destination_tile + tile_count * 2u > DYNAMIC_TEXT_OBJ_TILE_BASE) invalidate_hud_pixel_text_tiles();
    gbs_hw_enqueue_vblank_dma16(data, MEM_OBJ_TILES + destination_tile * 16, tile_count * 32);
}

void gbs_hw_load_affine_bg_tiles(const uint8_t* data, uint32_t destination_tile, uint32_t tile_count) {
    if (data == 0 || tile_count == 0 || destination_tile + tile_count > 256) {
        return;
    }
    const uint32_t character_base = 2u;
    gbs_hw_enqueue_vblank_dma16(
        data,
        MEM_VRAM + character_base * 0x2000u + destination_tile * 32u,
        tile_count * 32u
    );
}

void gbs_hw_load_affine_bg_tiles_for_layer(int layer, const uint8_t* data, uint32_t destination_tile, uint32_t tile_count) {
    if ((layer != 2 && layer != 3) || data == 0 || tile_count == 0 || destination_tile + tile_count > 256) {
        return;
    }
    /* A composition activates one affine layer at a time, so both supported
     * layers use the same dedicated 16 KiB character block. */
    const uint32_t character_base = 2u;
    gbs_hw_set_bg_character_base(layer, character_base);
    gbs_hw_enqueue_vblank_dma16(
        data,
        MEM_VRAM + character_base * 0x2000u + destination_tile * 32u,
        tile_count * 32u
    );
}

void gbs_hw_load_bg_tilemap(int layer, const uint16_t* entries, uint32_t width, uint32_t height, uint32_t map_size) {
    uint32_t screenblock_count = screenblock_count_for_map_size(map_size);
    if (layer < 0 || layer > 3 || entries == 0 || width == 0 || height == 0 || width > 64 || height > 64 || screenblock_count == 0) {
        return;
    }

    const int stage_tilemap = screenblock_count == 1;

    shadow_bg_map_size[layer] = (uint8_t)(map_size & 3u);
    shadow_bg_map_size_pending_mask = (uint8_t)(shadow_bg_map_size_pending_mask | (1u << layer));

    for (uint32_t block = 0; block < screenblock_count; ++block) {
        volatile uint16_t* screenblock = stage_tilemap && block == 0
            ? shadow_bg_tilemaps[layer]
            : screenblock_address(bg_screenblocks[layer] + block);
        for (uint32_t index = 0; index < 1024; ++index) {
            screenblock[index] = 0;
        }
    }

    for (uint32_t y = 0; y < height; ++y) {
        for (uint32_t x = 0; x < width; ++x) {
            uint32_t block = tilemap_block_index(width, height, x, y);
            uint32_t local_x = x & 31u;
            uint32_t local_y = y & 31u;
            volatile uint16_t* screenblock = stage_tilemap && block == 0
                ? shadow_bg_tilemaps[layer]
                : screenblock_address(bg_screenblocks[layer] + block);
            screenblock[local_y * 32 + local_x] = entries[y * width + x];
        }
    }

    if (stage_tilemap) {
        shadow_bg_tilemap_pending_mask = (uint8_t)(shadow_bg_tilemap_pending_mask | (1u << layer));
    }
}

void gbs_hw_set_bg_tilemap_entry(int layer, uint32_t x, uint32_t y, uint32_t width, uint32_t height, uint16_t tile) {
    if (layer < 0 || layer > 3 || x >= width || y >= height || width == 0 || height == 0 || width > 64 || height > 64) {
        return;
    }

    uint32_t block = tilemap_block_index(width, height, x, y);
    uint32_t local_x = x & 31u;
    uint32_t local_y = y & 31u;
    const int stage_ui_map = layer == UI_BACKGROUND_LAYER && width <= 32 && height <= 32 && block == 0;
    volatile uint16_t* screenblock = stage_ui_map
        ? shadow_bg_tilemaps[UI_BACKGROUND_LAYER]
        : screenblock_address(bg_screenblocks[layer] + block);
    screenblock[local_y * 32 + local_x] = tile;
    if (stage_ui_map) {
        shadow_bg_tilemap_pending_mask = (uint8_t)(shadow_bg_tilemap_pending_mask | (1u << UI_BACKGROUND_LAYER));
    }
}

void gbs_hw_load_affine_bg_tilemap(int layer, const uint8_t* entries, uint32_t width, uint32_t height, uint32_t map_size) {
    uint32_t screenblock_count = affine_screenblock_count_for_map_size(map_size);
    if ((layer != 2 && layer != 3) || entries == 0 || width == 0 || height == 0 || width != height ||
        (width != 16 && width != 32 && width != 64 && width != 128) || map_size > 3 || screenblock_count == 0) {
        return;
    }

    shadow_bg_map_size[layer] = (uint8_t)(map_size & 3u);
    shadow_bg_map_size_pending_mask = (uint8_t)(shadow_bg_map_size_pending_mask | (1u << layer));
    shadow_bg_depth[layer] = 1;
    shadow_bg_depth_mask = (uint8_t)(shadow_bg_depth_mask | (1u << layer));
    bg_screenblocks[layer] = affine_screenblock_base;
    shadow_bg_screen_base_pending_mask = (uint8_t)(shadow_bg_screen_base_pending_mask | (1u << layer));

    /* VRAM needs halfword writes. The VBlank queue transfers the original
     * map directly; its DMA16 helper also handles unaligned byte sources. */
    volatile uint16_t* destination = (volatile uint16_t*)(0x06000000 + affine_screenblock_base * 0x800);
    for (uint32_t index = 0; index < screenblock_count * 0x400u; ++index) {
        destination[index] = 0;
    }
    gbs_hw_enqueue_vblank_dma16(entries, destination, width * height / 2u);
}

void gbs_hw_set_display_mode(uint16_t mode) {
    if (mode > 5u) {
        return;
    }
    REG_DISPCNT = (uint16_t)((REG_DISPCNT & ~0x0007u) | (mode & 0x0007u));
}

void gbs_hw_set_affine_bg_wrap(int layer, int enabled) {
    if (layer != 2 && layer != 3) {
        return;
    }
    volatile uint16_t* control = bg_control_register(layer);
    if (enabled) {
        *control = (uint16_t)(*control | (1u << 13));
    } else {
        *control = (uint16_t)(*control & ~(1u << 13));
    }
}

void gbs_hw_set_affine_bg_transform(int layer, int16_t pa, int16_t pb, int16_t pc, int16_t pd, int32_t reference_x_8, int32_t reference_y_8) {
    volatile uint16_t* matrix = affine_bg_matrix_registers(layer);
    volatile uint32_t* reference = affine_bg_reference_registers(layer);
    if (matrix == 0 || reference == 0) {
        return;
    }

    matrix[0] = (uint16_t)pa;
    matrix[1] = (uint16_t)pb;
    matrix[2] = (uint16_t)pc;
    matrix[3] = (uint16_t)pd;
    reference[0] = (uint32_t)reference_x_8;
    reference[1] = (uint32_t)reference_y_8;
}

void gbs_hw_load_bitmap16(uint16_t mode, const uint16_t* pixels, uint16_t width, uint16_t height, uint16_t page) {
    if (pixels == 0 || (mode != 3u && mode != 5u) || (mode == 3u && page != 0u) || page > 1u) {
        return;
    }
    uint16_t screen_width = bitmap_mode_width_for_hardware(mode);
    uint16_t screen_height = bitmap_mode_height_for_hardware(mode);
    if (width == 0 || height == 0 || width > screen_width || height > screen_height) {
        return;
    }

    volatile uint16_t* destination = bitmap16_address(mode, page);
    for (uint16_t y = 0; y < height; ++y) {
        gbs_hw_enqueue_vblank_dma16(pixels + y * width, destination + y * screen_width, width);
    }
}

void gbs_hw_load_bitmap8(const uint8_t* pixels, uint16_t width, uint16_t height, uint16_t page) {
    if (pixels == 0 || page > 1u || width == 0 || height == 0 || width > 240u || height > 160u) {
        return;
    }

    volatile uint16_t* destination = bitmap8_address(page);
    for (uint16_t y = 0; y < height; ++y) {
        for (uint16_t x = 0; x < width; x += 2) {
            uint8_t left = pixels[y * width + x];
            uint8_t right = (uint8_t)(x + 1 < width ? pixels[y * width + x + 1] : 0);
            destination[y * 120u + x / 2u] = (uint16_t)(left | (right << 8));
        }
    }
}

void gbs_hw_fill_bitmap16(uint16_t mode, uint16_t color, uint16_t page) {
    if ((mode != 3u && mode != 5u) || (mode == 3u && page != 0u) || page > 1u) {
        return;
    }
    uint16_t screen_width = bitmap_mode_width_for_hardware(mode);
    uint16_t screen_height = bitmap_mode_height_for_hardware(mode);
    volatile uint16_t* destination = bitmap16_address(mode, page);
    const uint32_t pixel_count = (uint32_t)screen_width * screen_height;
    const uint32_t packed_color = (uint32_t)color | ((uint32_t)color << 16);
    if (!gbs_bios_cpu_fast_set(&packed_color, (void*)destination, pixel_count / 2u, 1)) {
        for (uint32_t index = 0; index < pixel_count; ++index) {
            destination[index] = color;
        }
    }
}

void gbs_hw_update_bitmap16_rect(uint16_t mode, uint16_t page, uint16_t x, uint16_t y, uint16_t width, uint16_t height, const uint16_t* pixels, uint16_t stride) {
    if (pixels == 0 || width == 0 || height == 0) {
        return;
    }
    const uint16_t screen_width = bitmap_mode_width_for_hardware(mode);
    volatile uint16_t* destination = bitmap16_address(mode, page);
    if (destination == 0) {
        return;
    }
    for (uint16_t row = 0; row < height; ++row) {
        gbs_hw_enqueue_vblank_dma16(pixels + row * stride, destination + (y + row) * screen_width + x, width);
    }
}

void gbs_hw_update_bitmap8_rect(uint16_t page, uint16_t x, uint16_t y, uint16_t width, uint16_t height, const uint8_t* pixels, uint16_t stride) {
    if (pixels == 0 || width == 0 || height == 0) {
        return;
    }
    volatile uint16_t* destination = bitmap8_address(page);
    for (uint16_t row = 0; row < height; ++row) {
        for (uint16_t column = 0; column < width; ++column) {
            const uint32_t pixel_offset = (uint32_t)(y + row) * 240u + x + column;
            const uint16_t current = destination[pixel_offset / 2u];
            const uint16_t pixel = pixels[row * stride + column];
            destination[pixel_offset / 2u] = (pixel_offset & 1u)
                ? (uint16_t)((current & 0x00FFu) | (pixel << 8))
                : (uint16_t)((current & 0xFF00u) | pixel);
        }
    }
}

void gbs_hw_set_display_frame_page(uint16_t page) {
    if (page > 1u) {
        return;
    }
    if (page == 1u) {
        REG_DISPCNT = (uint16_t)(REG_DISPCNT | (1u << 4));
    } else {
        REG_DISPCNT = (uint16_t)(REG_DISPCNT & ~(1u << 4));
    }
}

void gbs_hw_set_bg_priority(int layer, uint16_t priority) {
    if (layer < 0 || layer > 3 || priority > 3) {
        return;
    }

    const uint8_t layer_mask = (uint8_t)(1u << layer);
    if ((shadow_bg_priority_pending_mask & layer_mask) == 0) {
        shadow_bg_priority[layer] = (uint8_t)(*bg_control_register(layer) & 3u);
    }
    shadow_bg_priority[layer] = (uint8_t)(priority & 3u);
    shadow_bg_priority_pending_mask = (uint8_t)(shadow_bg_priority_pending_mask | layer_mask);
}

void gbs_hw_set_bg_mosaic(int layer, int enabled) {
    if (layer < 0 || layer > 3) {
        return;
    }

    volatile uint16_t* control = bg_control_register(layer);
    if (enabled) {
        *control = (uint16_t)(*control | (1u << 6));
    } else {
        *control = (uint16_t)(*control & ~(1u << 6));
    }
}

void gbs_hw_set_blending(uint16_t first_targets, uint16_t second_targets, uint16_t mode, uint16_t eva, uint16_t evb, uint16_t intensity) {
    REG_BLDCNT = (uint16_t)((first_targets & 0x3Fu) | ((mode & 0x3u) << 6) | ((second_targets & 0x3Fu) << 8));
    REG_BLDALPHA = (uint16_t)((eva & 0x1Fu) | ((evb & 0x1Fu) << 8));
    REG_BLDY = (uint16_t)(intensity & 0x1Fu);
}

void gbs_hw_disable_blending(void) {
    REG_BLDCNT = 0;
    REG_BLDALPHA = 0;
    REG_BLDY = 0;
}

void gbs_hw_set_mosaic(uint16_t bg_x, uint16_t bg_y, uint16_t obj_x, uint16_t obj_y) {
    REG_MOSAIC = (uint16_t)((bg_x & 0x0Fu) | ((bg_y & 0x0Fu) << 4) | ((obj_x & 0x0Fu) << 8) | ((obj_y & 0x0Fu) << 12));
}

void gbs_hw_disable_mosaic(void) {
    REG_MOSAIC = 0;
}

void gbs_hw_set_window0(uint16_t left, uint16_t right, uint16_t top, uint16_t bottom, uint16_t inside_mask, uint16_t outside_mask, int enabled) {
    REG_WIN0H = (uint16_t)(((left & 0xFFu) << 8) | (right & 0xFFu));
    REG_WIN0V = (uint16_t)(((top & 0xFFu) << 8) | (bottom & 0xFFu));
    REG_WININ = (uint16_t)((REG_WININ & 0xFF00u) | (inside_mask & 0x3Fu));
    REG_WINOUT = (uint16_t)((REG_WINOUT & 0xFFC0u) | (outside_mask & 0x3Fu));
    if (enabled) {
        REG_DISPCNT = (uint16_t)(REG_DISPCNT | (1u << 13));
    } else {
        REG_DISPCNT = (uint16_t)(REG_DISPCNT & ~(1u << 13));
    }
}

void gbs_hw_set_window1(uint16_t left, uint16_t right, uint16_t top, uint16_t bottom, uint16_t inside_mask, uint16_t outside_mask, int enabled) {
    REG_WIN1H = (uint16_t)(((left & 0xFFu) << 8) | (right & 0xFFu));
    REG_WIN1V = (uint16_t)(((top & 0xFFu) << 8) | (bottom & 0xFFu));
    REG_WININ = (uint16_t)((REG_WININ & 0x00FFu) | ((inside_mask & 0x3Fu) << 8));
    REG_WINOUT = (uint16_t)((REG_WINOUT & 0xFFC0u) | (outside_mask & 0x3Fu));
    if (enabled) {
        REG_DISPCNT = (uint16_t)(REG_DISPCNT | (1u << 14));
    } else {
        REG_DISPCNT = (uint16_t)(REG_DISPCNT & ~(1u << 14));
    }
}

void gbs_hw_set_obj_window(uint16_t inside_mask, uint16_t outside_mask, int enabled) {
    if (enabled) {
        REG_WINOUT = (uint16_t)((outside_mask & 0x3Fu) | ((inside_mask & 0x3Fu) << 8));
        REG_DISPCNT = (uint16_t)(REG_DISPCNT | (1u << 15));
    } else {
        REG_WINOUT = (uint16_t)((REG_WINOUT & 0x00FFu) | ((inside_mask & 0x3Fu) << 8));
        REG_DISPCNT = (uint16_t)(REG_DISPCNT & ~(1u << 15));
    }
}

void gbs_hw_draw_room_to_bg(int layer, const uint8_t* tiles, int width, int height, int camera_x, int camera_y) {
    if (layer < 0 || layer > 3) {
        return;
    }
    stage_room_tilemap8(layer, tiles, width, height, camera_x, camera_y);
}

void gbs_hw_draw_room_to_bg0(const uint8_t* tiles, int width, int height, int camera_x, int camera_y) {
    gbs_hw_draw_room_to_bg(WORLD_BACKGROUND_LAYER, tiles, width, height, camera_x, camera_y);
}

void gbs_hw_draw_room16_to_bg(int layer, const uint16_t* tiles, int width, int height, int camera_x, int camera_y) {
    if (layer < 0 || layer > 3) {
        return;
    }
    stage_room_tilemap16(layer, tiles, width, height, camera_x, camera_y);
}

void gbs_hw_draw_room16_to_bg0(const uint16_t* tiles, int width, int height, int camera_x, int camera_y) {
    gbs_hw_draw_room16_to_bg(WORLD_BACKGROUND_LAYER, tiles, width, height, camera_x, camera_y);
}

void gbs_hw_draw_dialogue_box(const char* text, int visible) {
    gbs_hw_draw_text_box(DIALOGUE_BOX_X, DIALOGUE_BOX_Y, DIALOGUE_BOX_W, DIALOGUE_BOX_H, text, visible);
}

static void gbs_hw_draw_text_box_with_skin(
    int box_x,
    int box_y,
    int box_w,
    int box_h,
    const char* text,
    int visible,
    unsigned skin_base,
    unsigned background_palette,
    int skin_active
) {
    if (box_x < 0 || box_y < 0 || box_w < 3 || box_h < 3 || box_x + box_w > 32 || box_y + box_h > 32) {
        return;
    }

    volatile uint16_t* screenblock = shadow_bg_tilemaps[UI_BACKGROUND_LAYER];
    if (!visible || text == 0) {
        for (int y = 0; y < box_h; ++y) {
            for (int x = 0; x < box_w; ++x) {
                /* Tile 0 / color 0 is transparent — world BG1 shows through. */
                screenblock[(box_y + y) * 32 + box_x + x] = 0;
            }
        }
        gbs_hw_mark_ui_tilemap_dirty();
        return;
    }

    for (int y = 0; y < box_h; ++y) {
        for (int x = 0; x < box_w; ++x) {
            uint16_t tile;
            /* Uma skin autoral e um 9-slice completo: cantos, bordas e miolo.
             * Assets transparentes continuam suportados pela cor 0 da paleta. */
            if (skin_active) {
                tile = (uint16_t)(skin_base + dialogue_box_skin_zone_index(x, y, box_w, box_h));
            } else if (y == 0 || y == box_h - 1 || x == 0 || x == box_w - 1) {
                tile = DIALOGUE_TILE_BORDER;
            } else {
                tile = DIALOGUE_TILE_BLANK;
            }
            screenblock[(box_y + y) * 32 + box_x + x] = ui_tile_entry(tile, background_palette);
        }
    }

    int line = 0;
    int column = 0;
    int text_w = box_w - 2;
    int text_lines = box_h - 2;
    const char* cursor = text;
    while (*cursor != '\0' && line < text_lines) {
        const uint32_t codepoint = gbs_text_next_codepoint(&cursor);
        if (codepoint == '\n') {
            ++line;
            column = 0;
            continue;
        }
        if (column >= text_w) {
            ++line;
            column = 0;
            if (line >= text_lines) {
                break;
            }
        }

        unsigned tile_index = dialogue_bg_tile_for_codepoint(codepoint);
        if (dialogue_choice_selector_active && line > 0 && column == 0 && codepoint == '!') {
            tile_index = DIALOGUE_TILE_SELECTOR;
        }
        screenblock[(box_y + 1 + line) * 32 + box_x + 1 + column] = dialogue_tile_entry(tile_index);
        ++column;
    }
    gbs_hw_mark_ui_tilemap_dirty();
}

/* Unframed text on the UI BG plane, preserving the world artwork banks.
 * The runtime maps world tile coordinates through the current camera. */
void gbs_hw_draw_text_at(int x, int y, int width, const char* text) {
    if (y < 0 || y >= 20 || width <= 0) return;
    if(text == 0) {
        for(int column=0;column<width;++column) if(x+column>=0 && x+column<30) shadow_bg_tilemaps[UI_BACKGROUND_LAYER][y*32+x+column]=0;
        gbs_hw_mark_ui_tilemap_dirty();return;
    }
    const char* cursor=text;
    int column=0;
    while(*cursor!='\0' && column<width) {
        const uint32_t codepoint=gbs_text_next_codepoint(&cursor);
        if(codepoint=='\n') break;
        const int screen_x=x+column++;
        if(screen_x<0 || screen_x>=30) continue;
        shadow_bg_tilemaps[UI_BACKGROUND_LAYER][y*32+screen_x]=dialogue_tile_entry(dialogue_bg_tile_for_codepoint(codepoint));
    }
    gbs_hw_mark_ui_tilemap_dirty();
}

void gbs_hw_draw_text_box(int box_x, int box_y, int box_w, int box_h, const char* text, int visible) {
    gbs_hw_draw_text_box_with_skin(
        box_x, box_y, box_w, box_h, text, visible,
        DIALOGUE_TILE_SKIN_BASE, DIALOGUE_PALETTE, dialogue_box_skin_active
    );
}

static void gbs_hw_clear_text_overlay_slots(int first, int count) {
    if (first < 0) first = 0;
    if (first >= DYNAMIC_TEXT_OBJ_OAM_COUNT || count <= 0) return;
    if (first + count > DYNAMIC_TEXT_OBJ_OAM_COUNT) {
        count = DYNAMIC_TEXT_OBJ_OAM_COUNT - first;
    }
    for (int index = 0; index < count; ++index) {
        gbs_hw_set_sprite(
            DYNAMIC_TEXT_OBJ_OAM_BASE + first + index,
            0, 160, 0, DIALOGUE_PALETTE, 0, 0, 0, 0, 0, 0, 0, 0
        );
    }
}

static void gbs_hw_clear_hud_icon_slots(void) {
    const int previous_count = hud_icon_obj_count;
    hud_icon_obj_count = 0;
    for (int index = 0; index < previous_count; ++index) {
        gbs_hw_set_sprite(
            gbs_hw_hud_icon_slot(index),
            0, 160, 0, DIALOGUE_PALETTE, 0, 0, 0, 0, 0, 0, 0, 0
        );
    }
}

static uint16_t gbs_hw_hud_icon_shape(int width, int height) {
    if (width == height && (width == 8 || width == 16 || width == 32 || width == 64)) return 0;
    if ((width == 16 && height == 8) ||
        (width == 32 && height == 8) ||
        (width == 32 && height == 16) ||
        (width == 64 && height == 32)) return 1;
    if ((width == 8 && height == 16) ||
        (width == 8 && height == 32) ||
        (width == 16 && height == 32) ||
        (width == 32 && height == 64)) return 2;
    return 3;
}

static uint16_t gbs_hw_hud_icon_size(int width, int height) {
    if ((width == 8 && height == 8) || (width == 16 && height == 8) || (width == 8 && height == 16)) return 0;
    if ((width == 16 && height == 16) || (width == 32 && height == 8) || (width == 8 && height == 32)) return 1;
    if ((width == 32 && height == 32) || (width == 32 && height == 16) || (width == 16 && height == 32)) return 2;
    if ((width == 64 && height == 64) || (width == 64 && height == 32) || (width == 32 && height == 64)) return 3;
    return 0;
}

static int gbs_hw_draw_hud_icon(const void* raw_metasprite, int x, int y, int visible, uint16_t priority) {
    const struct gbs_hw_metasprite* metasprite = (const struct gbs_hw_metasprite*)raw_metasprite;
    if (!visible || metasprite == 0 || metasprite->parts == 0 || metasprite->part_count == 0 ||
        metasprite->part_count > HUD_ICON_OBJ_OAM_COUNT) {
        return 0;
    }

    if (hud_icon_obj_count + metasprite->part_count > HUD_ICON_OBJ_OAM_COUNT) return 0;
    for (uint8_t part_index = 0; part_index < metasprite->part_count; ++part_index) {
        const struct gbs_hw_metasprite_part* part = &metasprite->parts[part_index];
        const uint16_t shape = gbs_hw_hud_icon_shape(part->width, part->height);
        if (shape == 3) return 0;
    }

    hud_icon_obj_write = 1;
    for (uint8_t part_index = 0; part_index < metasprite->part_count; ++part_index) {
        const struct gbs_hw_metasprite_part* part = &metasprite->parts[part_index];
        gbs_hw_set_sprite(
            gbs_hw_hud_icon_slot(hud_icon_obj_count + part_index),
            x + part->x,
            y + part->y,
            part->tile_index,
            part->palette & 15,
            part->hflip != 0,
            part->vflip != 0,
            1,
            priority,
            0,
            0,
            gbs_hw_hud_icon_shape(part->width, part->height),
            gbs_hw_hud_icon_size(part->width, part->height)
        );
    }
    hud_icon_obj_write = 0;
    hud_icon_obj_count += metasprite->part_count;
    return 1;
}

static void gbs_hw_draw_text_overlay_at(
    int x,
    int y,
    int width,
    const char* text,
    int oam_offset,
    int visible,
    unsigned palette
) {
    if (x < 0 || y < 0 || width <= 0 || x + width > 32 || y >= 32 ||
        oam_offset < 0 || oam_offset >= DYNAMIC_TEXT_OBJ_OAM_COUNT) {
        return;
    }
    const int slot_count = width < DYNAMIC_TEXT_OBJ_OAM_COUNT - oam_offset
        ? width
        : DYNAMIC_TEXT_OBJ_OAM_COUNT - oam_offset;
    gbs_hw_clear_text_overlay_slots(oam_offset, slot_count);
    if (!visible || text == 0) return;

    int column = 0;
    const char* cursor = text;
    while (*cursor != '\0' && column < slot_count) {
        const uint32_t codepoint = gbs_text_next_codepoint(&cursor);
        if (codepoint == '\n') break;
        const unsigned tile_index = dialogue_obj_tile_for_codepoint(codepoint, (unsigned)(oam_offset + column));
        gbs_hw_set_sprite(
            DYNAMIC_TEXT_OBJ_OAM_BASE + oam_offset + column,
            x * 8 + column * 8,
            y * 8,
            tile_index,
            palette,
            0, 0, 1, 0, 0, 0, 0, 0
        );
        ++column;
    }
}

void gbs_hw_draw_text_overlay(int x, int y, int width, const char* text, int visible) {
    gbs_hw_clear_text_overlay_slots(0, DYNAMIC_TEXT_OBJ_OAM_COUNT);
    gbs_hw_draw_text_overlay_at(x, y, width, text, 0, visible, DIALOGUE_PALETTE);
}

void gbs_hw_draw_text_overlay_slot(int x, int y, int width, const char* text, int oam_offset, int visible) {
    gbs_hw_draw_text_overlay_at(x, y, width, text, oam_offset, visible, DIALOGUE_PALETTE);
}

void gbs_hw_draw_text_overlay_light(int x, int y, int width, const char* text, int visible) {
    gbs_hw_clear_text_overlay_slots(0, DYNAMIC_TEXT_OBJ_OAM_COUNT);
    gbs_hw_draw_text_overlay_at(x, y, width, text, 0, visible, NAME_INPUT_OBJ_PALETTE);
}

/* Advanced HUD text belongs to the fixed BG0 UI layer. Rendering each glyph
 * as an OBJ consumes one OAM entry per character, which is not enough for a
 * composed HUD with several rows (for example the dungeon sidebar). */
static void gbs_hw_draw_hud_text_at(
    int box_x,
    int box_y,
    int box_w,
    int box_h,
    const char* text,
    int visible
) {
    if (box_x < 0 || box_y < 0 || box_w <= 0 || box_h <= 0 ||
        box_x + box_w > 32 || box_y + box_h > 32) {
        return;
    }
    if (!visible || text == 0) return;

    volatile uint16_t* screenblock = shadow_bg_tilemaps[UI_BACKGROUND_LAYER];
    int line = 0;
    int column = 0;
    const char* cursor = text;
    while (*cursor != '\0' && line < box_h) {
        const uint32_t codepoint = gbs_text_next_codepoint(&cursor);
        if (codepoint == '\n') {
            ++line;
            column = 0;
            continue;
        }
        if (column >= box_w) {
            ++line;
            column = 0;
            if (line >= box_h) break;
        }
        const unsigned tile_index = dialogue_bg_tile_for_codepoint(codepoint);
        screenblock[(box_y + line) * 32 + box_x + column] = ui_tile_entry(tile_index, HUD_PALETTE);
        ++column;
    }
    gbs_hw_mark_ui_tilemap_dirty();
}

static void gbs_hw_draw_text_input_keyboard_glyph(
    volatile uint16_t* screenblock,
    int x,
    int y,
    uint32_t codepoint
) {
    screenblock[y * 32 + x] = name_input_glyph_tile_entry(dialogue_bg_tile_for_codepoint(codepoint));
}

static void gbs_hw_draw_name_input_surface(int box_x, int box_y, int box_w, int box_h, int visible) {
    if (box_x < 0 || box_y < 0 || box_w <= 0 || box_h <= 0 ||
        box_x + box_w > 32 || box_y + box_h > 32) {
        return;
    }

    volatile uint16_t* screenblock = shadow_bg_tilemaps[UI_BACKGROUND_LAYER];
    for (int y = 0; y < box_h; ++y) {
        for (int x = 0; x < box_w; ++x) {
            if (!visible) {
                screenblock[(box_y + y) * 32 + box_x + x] = 0;
                continue;
            }

            unsigned tile = NAME_INPUT_TILE_SURFACE;
            if (x == 0 || y == 0 || x == box_w - 1 || y == box_h - 1) {
                tile = NAME_INPUT_TILE_BORDER;
            }
            screenblock[(box_y + y) * 32 + box_x + x] = name_input_tile_entry(tile);
        }
    }
    gbs_hw_mark_ui_tilemap_dirty();
}

void gbs_hw_draw_text_input_surface(int box_x, int box_y, int box_w, int box_h, int visible) {
    static int previous_x = 0;
    static int previous_y = 0;
    static int previous_w = 0;
    static int previous_h = 0;
    volatile uint16_t* screenblock = shadow_bg_tilemaps[UI_BACKGROUND_LAYER];

    for (int y = 0; y < previous_h; ++y) {
        for (int x = 0; x < previous_w; ++x) {
            screenblock[(previous_y + y) * 32 + previous_x + x] = 0;
        }
    }
    previous_x = 0;
    previous_y = 0;
    previous_w = 0;
    previous_h = 0;

    if (!visible || box_x < 0 || box_y < 0 || box_w <= 0 || box_h <= 0 ||
        box_x + box_w > 32 || box_y + box_h > 20) {
        gbs_hw_mark_ui_tilemap_dirty();
        return;
    }

    gbs_hw_draw_name_input_surface(box_x, box_y, box_w, box_h, 1);
    previous_x = box_x;
    previous_y = box_y;
    previous_w = box_w;
    previous_h = box_h;
    gbs_hw_mark_ui_tilemap_dirty();
}

void gbs_hw_draw_text_input_keyboard(int box_x, int box_y, int box_w, int box_h, int selected_index, int lowercase, int visible) {
    gbs_hw_draw_text_input_keyboard_with_controls(
        box_x,
        box_y,
        box_w,
        box_h,
        selected_index,
        lowercase,
        visible,
        0,
        0,
        0,
        0,
        0,
        0
    );
}

void gbs_hw_draw_text_input_keyboard_with_controls(
    int box_x,
    int box_y,
    int box_w,
    int box_h,
    int selected_index,
    int lowercase,
    int visible,
    int control_layout,
    int controls_x,
    int controls_y,
    int controls_width,
    int controls_height,
    int surface_mode
) {
    static int previous_x = 0;
    static int previous_y = 0;
    static int previous_w = 0;
    static int previous_h = 0;
    volatile uint16_t* screenblock = shadow_bg_tilemaps[UI_BACKGROUND_LAYER];

    for (int y = 0; y < previous_h; ++y) {
        for (int x = 0; x < previous_w; ++x) {
            screenblock[(previous_y + y) * 32 + previous_x + x] = 0;
        }
    }
    gbs_hw_mark_ui_tilemap_dirty();
    previous_x = 0;
    previous_y = 0;
    previous_w = 0;
    previous_h = 0;

    const int side_controls = control_layout == 1;
    const int bottom_grid = control_layout == 2;
    if (!visible || box_x < 0 || box_y < 0 || box_w < (bottom_grid ? 16 : 22) || box_h < (bottom_grid ? 10 : 6) ||
        box_x + box_w > 32 || box_y + box_h > 20 ||
        (side_controls && (controls_x < box_x + box_w || controls_y < box_y ||
            controls_width < 5 || controls_height < 6 || controls_x + controls_width > 32 ||
            controls_y + controls_height > 20))) {
        return;
    }

    if (surface_mode != 1) {
        surface_mode = 0;
    }

    /* The authoring contract reserves a 22x6 minimum. Side controls use four
     * compact letter rows, matching the reference input screen. */
    if (!bottom_grid) write_demo_tile(NAME_INPUT_TILE_BORDER, NAME_INPUT_COLOR_BORDER);
    gbs_hw_draw_name_input_surface(box_x, box_y, box_w, box_h, surface_mode == 0);

    if (selected_index < 0 || selected_index > 28) {
        selected_index = 0;
    }
    const volatile uint16_t selector_tile = name_input_tile_entry(NAME_INPUT_TILE_SELECTOR);
    const volatile uint16_t blank_tile = surface_mode == 0
        ? name_input_tile_entry(NAME_INPUT_TILE_SURFACE)
        : 0;
    if (bottom_grid) {
        /* The scene owns the keycaps. Transparent OBJ glyphs can be centered
         * at sub-tile positions; BG0 only carries focus.
         * Bank 15 is reserved by this layout's background contract. */
        static uint16_t focus_palette[16];
        for (int color = 0; color < 16; ++color) focus_palette[color] = name_input_palette_colors[color];
        focus_palette[NAME_INPUT_COLOR_SELECTOR] = 0x1AFF; /* warm gold */
        gbs_hw_enqueue_vblank_dma16(focus_palette, MEM_PALETTE + 240, 16);
        static const uint8_t focus_corner[8] = {0xF0, 0xC0, 0xC0, 0x80, 0, 0, 0, 0};
        volatile uint16_t* focus_tile = MEM_VRAM + (ui_character_base * 512u + NAME_INPUT_TILE_BORDER) * 16u;
        for (uint8_t y = 0; y < 8; ++y) {
            focus_tile[y * 2] = pack_font_pixels(focus_corner[y], 0, 0, NAME_INPUT_COLOR_SELECTOR);
            focus_tile[y * 2 + 1] = pack_font_pixels(focus_corner[y], 4, 0, NAME_INPUT_COLOR_SELECTOR);
        }
        int glyph_slot = 0;
        for (int row = 0; row < 4; ++row) {
            for (int column = 0; column < 8; ++column) {
                const int index = row * 8 + column;
                if (index >= 26) continue;
                const int x = box_x + column * 2;
                const int y = box_y + row * 2;
                if (index == selected_index) {
                    const uint16_t corner = ui_tile_entry(NAME_INPUT_TILE_BORDER, 15);
                    screenblock[y * 32 + x] = corner;
                    screenblock[y * 32 + x + 1] = corner | (1u << 10);
                    screenblock[(y + 1) * 32 + x] = corner | (1u << 11);
                    screenblock[(y + 1) * 32 + x + 1] = corner | (3u << 10);
                }
                const unsigned tile = dialogue_obj_tile_for_codepoint((lowercase ? 'a' : 'A') + index, NAME_KEYBOARD_OBJ_GLYPH_OFFSET + glyph_slot);
                gbs_hw_set_sprite(NAME_KEYBOARD_OBJ_OAM_BASE + glyph_slot++, x * 8 + 4, y * 8 + 4, tile, NAME_INPUT_OBJ_PALETTE, 0, 0, 1, 0, 0, 0, 0, 0);
            }
        }
        const int offsets[3] = {0, 6, 12};
        const char* labels[3] = {"DEL", lowercase ? "aA" : "Aa", "OK"};
        for (int control = 0; control < 3; ++control) {
            const int x = box_x + offsets[control];
            const int y = box_y + 8;
            if (selected_index == 26 + control) {
                const uint16_t corner = ui_tile_entry(NAME_INPUT_TILE_BORDER, 15);
                screenblock[y * 32 + x] = corner;
                screenblock[y * 32 + x + 4] = corner | (1u << 10);
                screenblock[(y + 1) * 32 + x] = corner | (1u << 11);
                screenblock[(y + 1) * 32 + x + 4] = corner | (3u << 10);
            }
            const int label_offset = control == 0 ? 8 : 12;
            for (int i = 0; labels[control][i]; ++i) {
                const unsigned tile = dialogue_obj_tile_for_codepoint(labels[control][i], NAME_KEYBOARD_OBJ_GLYPH_OFFSET + glyph_slot);
                gbs_hw_set_sprite(NAME_KEYBOARD_OBJ_OAM_BASE + glyph_slot++, x * 8 + label_offset + i * 8, y * 8 + 4, tile, NAME_INPUT_OBJ_PALETTE, 0, 0, 1, 0, 0, 0, 0, 0);
            }
        }
        queue_name_input_palette_restore();
        previous_x = box_x; previous_y = box_y; previous_w = box_w; previous_h = box_h;
        gbs_hw_mark_ui_tilemap_dirty();
        return;
    }
    const int keyboard_rows = side_controls ? 4 : 3;
    const int keyboard_columns = side_controls ? 8 : 10;
    for (int row = 0; row < keyboard_rows; ++row) {
        for (int column = 0; column < keyboard_columns; ++column) {
            const int letter_index = side_controls
                ? row * 8 + column
                : row * 10 + column;
            const int marker_x = box_x + 1 + column * 2;
            const int glyph_x = marker_x + 1;
            const int glyph_y = box_y + 1 + row;
            screenblock[glyph_y * 32 + marker_x] = letter_index == selected_index ? selector_tile : blank_tile;
            if (letter_index < 26) {
                const uint32_t codepoint = (lowercase ? 'a' : 'A') + (uint32_t)letter_index;
                gbs_hw_draw_text_input_keyboard_glyph(screenblock, glyph_x, glyph_y, codepoint);
            } else {
                screenblock[glyph_y * 32 + glyph_x] = blank_tile;
            }
        }
    }

    const char* control_labels[3] = { "BACK", lowercase ? "LOWR" : "UPPR", "DONE" };
    const int control_indices[3] = { 26, 27, 28 };
    if (!side_controls) {
        const int control_offsets[3] = { 1, 8, 15 };
        const int control_y = box_y + 4;
        for (int control = 0; control < 3; ++control) {
            const int marker_x = box_x + control_offsets[control];
            const int label_x = marker_x + 1;
            screenblock[control_y * 32 + marker_x] = control_indices[control] == selected_index ? selector_tile : blank_tile;
            const char* label = control_labels[control];
            for (int character = 0; label[character] != '\0' && label_x + character < box_x + box_w - 1; ++character) {
                gbs_hw_draw_text_input_keyboard_glyph(
                    screenblock,
                    label_x + character,
                    control_y,
                    (uint32_t)(unsigned char)label[character]
                );
            }
        }
    } else {
        for (int control = 0; control < 3; ++control) {
            const int control_y = controls_y + control * 2;
            gbs_hw_draw_name_input_surface(controls_x, control_y, controls_width, 2, surface_mode == 0);
            const int marker_x = controls_x;
            const int label_x = marker_x + 1;
            screenblock[control_y * 32 + marker_x] = control_indices[control] == selected_index ? selector_tile : blank_tile;
            const char* label = control_labels[control];
            for (int character = 0; label[character] != '\0' && label_x + character < controls_x + controls_width; ++character) {
                gbs_hw_draw_text_input_keyboard_glyph(
                    screenblock,
                    label_x + character,
                    control_y,
                    (uint32_t)(unsigned char)label[character]
                );
            }
        }
    }

    queue_name_input_palette_restore();

    previous_x = side_controls && controls_x < box_x ? controls_x : box_x;
    previous_y = side_controls && controls_y < box_y ? controls_y : box_y;
    const int right = side_controls && controls_x + controls_width > box_x + box_w
        ? controls_x + controls_width
        : box_x + box_w;
    const int bottom = side_controls && controls_y + controls_height > box_y + box_h
        ? controls_y + controls_height
        : box_y + box_h;
    previous_w = right - previous_x;
    previous_h = bottom - previous_y;
    gbs_hw_mark_ui_tilemap_dirty();
}

static void gbs_hw_clear_hud_layout_rects(void) {
    volatile uint16_t* screenblock = shadow_bg_tilemaps[UI_BACKGROUND_LAYER];
    if (hud_layout_previous_count > 0) {
        gbs_hw_mark_ui_tilemap_dirty();
    }
    for (int index = 0; index < hud_layout_previous_count; ++index) {
        const struct HudLayoutRect rect = hud_layout_previous_rects[index];
        for (int y = 0; y < rect.height; ++y) {
            for (int x = 0; x < rect.width; ++x) {
                screenblock[(rect.y + y) * 32 + rect.x + x] = 0;
            }
        }
    }
    hud_layout_previous_count = 0;
}

void gbs_hw_invalidate_hud_layout(void) {
    invalidate_hud_pixel_text_tiles();
    gbs_hw_clear_hud_layout_rects();
    gbs_hw_clear_text_overlay_slots(0, DYNAMIC_TEXT_OBJ_OAM_COUNT);
    gbs_hw_clear_hud_icon_slots();
    hud_layout_current_count = 0;
}

void gbs_hw_begin_hud_layout(int visible) {
    gbs_hw_clear_hud_layout_rects();
    gbs_hw_clear_text_overlay_slots(0, DYNAMIC_TEXT_OBJ_OAM_COUNT);
    gbs_hw_clear_hud_icon_slots();
    hud_layout_current_count = 0;
    hud_pixel_text_obj_count = 0;
    if (!visible) {
        return;
    }
}

/* Four glyph tiles form one 32x8 OBJ. Only sub-tile text uses this path;
 * aligned HUD text retains BG0 and consumes no dynamic text OAM entries.
 * The existing private tile arena (900..1023) holds 31 such groups. */
static void gbs_hw_draw_hud_pixel_text(int x, int y, int width, int height, const char* text, int visible) {
    if (!visible || text == 0) return;
    const int columns = width / 8;
    const int lines = height / 8;
    if (columns <= 0 || lines <= 0) return;
    MEM_PALETTE[256 + HUD_PALETTE_BASE + DIALOGUE_COLOR_TEXT] =
        MEM_PALETTE[HUD_PALETTE_BASE + DIALOGUE_COLOR_TEXT];
    int column = 0, line = 0;
    const char* cursor = text;
    while (*cursor != '\0' && line < lines) {
        if (*cursor == '\n') { ++cursor; column = 0; ++line; continue; }
        if (column >= columns) { column = 0; ++line; if (line >= lines) break; }
        if (hud_pixel_text_obj_count >= DYNAMIC_TEXT_OBJ_OAM_COUNT ||
            DYNAMIC_TEXT_OBJ_TILE_BASE + (hud_pixel_text_obj_count + 1) * 4 > 1024) return;
        const unsigned tile = DYNAMIC_TEXT_OBJ_TILE_BASE + hud_pixel_text_obj_count * 4;
        const int group_column = column;
        for (unsigned cell = 0; cell < 4; ++cell) {
            unsigned glyph = 0;
            if (*cursor != '\0' && *cursor != '\n' && column < columns) {
                glyph = gbs_text_glyph_index(gbs_text_next_codepoint(&cursor));
                ++column;
            }
            const unsigned slot = tile + cell - DYNAMIC_TEXT_OBJ_TILE_BASE;
            if (hud_pixel_text_glyphs[slot] != glyph) {
                /* Stable labels must not repaint every glyph every frame. */
                volatile uint16_t* target = MEM_OBJ_TILES + (tile + cell) * 16u;
                for (unsigned row = 0; row < 8; ++row) {
                    for (unsigned half = 0; half < 2; ++half) {
                        uint16_t pixels;
                        if (configured_dialogue_font_tiles != 0) {
                            const uint8_t* source = configured_dialogue_font_tiles + glyph * 32 + row * 4 + half * 2;
                            pixels = (source[0] & 15 ? 4u : 0u) | (source[0] & 240 ? 64u : 0u) |
                                (source[1] & 15 ? 1024u : 0u) | (source[1] & 240 ? 16384u : 0u);
                        } else {
                            pixels = pack_font_pixels(gbs_font_rows[glyph][row], half * 4, 0, DIALOGUE_COLOR_TEXT);
                        }
                        target[row * 2 + half] = pixels;
                    }
                }
                hud_pixel_text_glyphs[slot] = (uint16_t)glyph;
            }
        }
        gbs_hw_set_sprite(DYNAMIC_TEXT_OBJ_OAM_BASE + hud_pixel_text_obj_count++,
            x + group_column * 8, y + line * 8, tile, HUD_PALETTE,
            0, 0, 1, 0, 0, 0, 1, 1);
    }
}

static void gbs_hw_draw_hud_surface(int box_x, int box_y, int box_w, int box_h, int use_skin, int visible) {
    if (box_x < 0 || box_y < 0 || box_w <= 0 || box_h <= 0 || box_x + box_w > 32 || box_y + box_h > 32) {
        return;
    }

    volatile uint16_t* screenblock = shadow_bg_tilemaps[UI_BACKGROUND_LAYER];
    if (!visible) {
        for (int y = 0; y < box_h; ++y) {
            for (int x = 0; x < box_w; ++x) {
                screenblock[(box_y + y) * 32 + box_x + x] = 0;
            }
        }
        gbs_hw_mark_ui_tilemap_dirty();
        return;
    }

    for (int y = 0; y < box_h; ++y) {
        for (int x = 0; x < box_w; ++x) {
            unsigned tile;
            if (use_skin && hud_box_skin_active) {
                tile = HUD_TILE_SKIN_BASE + dialogue_box_skin_zone_index(x, y, box_w, box_h);
            } else if (y == 0 || y == box_h - 1 || x == 0 || x == box_w - 1) {
                tile = DIALOGUE_TILE_BORDER;
            } else {
                tile = DIALOGUE_TILE_BLANK;
            }
            screenblock[(box_y + y) * 32 + box_x + x] = ui_tile_entry(tile, HUD_PALETTE);
        }
    }
    gbs_hw_mark_ui_tilemap_dirty();
}

static void gbs_hw_remember_hud_layout_rect(int x, int y, int width, int height) {
    if (hud_layout_current_count >= HUD_LAYOUT_MAX_COMPONENTS) {
        return;
    }
    hud_layout_previous_rects[hud_layout_current_count].x = x;
    hud_layout_previous_rects[hud_layout_current_count].y = y;
    hud_layout_previous_rects[hud_layout_current_count].width = width;
    hud_layout_previous_rects[hud_layout_current_count].height = height;
    ++hud_layout_current_count;
}

void gbs_hw_draw_hud_layout_component(
    int kind,
    int x,
    int y,
    int width,
    int height,
    const char* text,
    int text_slot,
    const void* metasprite,
    int visible
) {
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || x >= 240 || y >= 160) {
        return;
    }
    int box_x = x / 8;
    int box_y = y / 8;
    int box_w = (width + 7) / 8;
    int box_h = (height + 7) / 8;
    if (box_x + box_w > 32) box_w = 32 - box_x;
    if (box_y + box_h > 32) box_h = 32 - box_y;
    if (box_w <= 0 || box_h <= 0) return;

    if (kind == GBS_HW_HUD_COMPONENT_FRAME) {
        /* A full-panel metasprite sits behind BG0 text; ordinary icons stay
         * in front. Both use the existing reserved HUD OAM slots. */
        if (metasprite != 0 && gbs_hw_draw_hud_icon(metasprite, x, y, visible, 1)) return;
        gbs_hw_draw_hud_surface(box_x, box_y, box_w, box_h, 1, visible);
        if (visible) gbs_hw_remember_hud_layout_rect(box_x, box_y, box_w, box_h);
        return;
    }
    if (kind == GBS_HW_HUD_COMPONENT_BAR) {
        if (metasprite != 0 && gbs_hw_draw_hud_icon(metasprite, x, y, visible, 1)) {
            /* A BG frame's opaque center otherwise masks the image gauge.
             * Release just the gauge cells; later text still draws above OBJ. */
            if (visible) gbs_hw_draw_hud_surface(box_x, box_y, box_w, box_h, 0, 0);
            return;
        }
        gbs_hw_draw_hud_surface(box_x, box_y, box_w, box_h, 0, visible);
        if (visible) gbs_hw_remember_hud_layout_rect(box_x, box_y, box_w, box_h);
        return;
    }
    if (kind == GBS_HW_HUD_COMPONENT_ICON && gbs_hw_draw_hud_icon(metasprite, x, y, visible, 0)) {
        return;
    }
    if (kind == GBS_HW_HUD_COMPONENT_TEXT || kind == GBS_HW_HUD_COMPONENT_ICON) {
        (void)text_slot;
        if ((x & 7) != 0 || (y & 7) != 0) {
            gbs_hw_draw_hud_pixel_text(x, y, width, height, text, visible);
            return;
        }
        gbs_hw_draw_hud_text_at(box_x, box_y, box_w, box_h, text, visible);
        if (visible) gbs_hw_remember_hud_layout_rect(box_x, box_y, box_w, box_h);
    }
}

void gbs_hw_end_hud_layout(void) {
    hud_layout_previous_count = hud_layout_current_count;
    hud_layout_current_count = 0;
}

void gbs_hw_draw_overlay_rect(int box_x, int box_y, int box_w, int box_h, int visible) {
    static int previous_x = 0;
    static int previous_y = 0;
    static int previous_w = 0;
    static int previous_h = 0;
    volatile uint16_t* screenblock = shadow_bg_tilemaps[UI_BACKGROUND_LAYER];

    for (int y = 0; y < previous_h; ++y) {
        for (int x = 0; x < previous_w; ++x) {
            screenblock[(previous_y + y) * 32 + previous_x + x] = 0;
        }
    }
    gbs_hw_mark_ui_tilemap_dirty();

    previous_x = 0;
    previous_y = 0;
    previous_w = 0;
    previous_h = 0;

    if (!visible || box_x < 0 || box_y < 0 || box_w <= 0 || box_h <= 0 || box_x + box_w > 32 || box_y + box_h > 32) {
        return;
    }

    const uint16_t fill_tile = dialogue_tile_entry(DIALOGUE_TILE_BLANK);
    for (int y = 0; y < box_h; ++y) {
        for (int x = 0; x < box_w; ++x) {
            screenblock[(box_y + y) * 32 + box_x + x] = fill_tile;
        }
    }

    previous_x = box_x;
    previous_y = box_y;
    previous_w = box_w;
    previous_h = box_h;
    gbs_hw_mark_ui_tilemap_dirty();
}

void gbs_hw_draw_hud_bar(const char* left_text, const char* right_text, int visible) {
    if (!visible) {
        gbs_hw_draw_text_box_with_skin(
            hud_box_x, hud_box_y, hud_box_w, hud_box_h, 0, 0,
            HUD_TILE_SKIN_BASE, HUD_PALETTE, hud_box_skin_active
        );
        return;
    }

    char combined[64];
    size_t length = 0;
    const char* sources[3] = { left_text, "  ", right_text };
    for (unsigned source_index = 0; source_index < 3; ++source_index) {
        const char* cursor = sources[source_index];
        if (cursor == 0) continue;
        while (*cursor != '\0' && length + 1 < sizeof(combined)) {
            combined[length++] = *cursor++;
        }
    }
    combined[length] = '\0';
    gbs_hw_draw_text_box_with_skin(
        hud_box_x, hud_box_y, hud_box_w, hud_box_h, combined, 1,
        HUD_TILE_SKIN_BASE, HUD_PALETTE, hud_box_skin_active
    );
}

void gbs_hw_audio_set_psg_pan(int channel, int pan) {
    if (channel < 1 || channel > 4) return;
    if (pan < -127) pan = -127;
    if (pan > 127) pan = 127;

    const uint16_t right_bit = (uint16_t)(1u << (7 + channel));
    const uint16_t left_bit = (uint16_t)(1u << (11 + channel));
    uint16_t control = (uint16_t)(REG_SOUNDCNT_L & (uint16_t)~(right_bit | left_bit));
    const int route_left = pan <= 63;
    const int route_right = pan >= -63;
    if (route_right) control = (uint16_t)(control | right_bit);
    if (route_left) control = (uint16_t)(control | left_bit);
    REG_SOUNDCNT_L = control;
}

void gbs_hw_audio_play_square(int channel, uint16_t frequency_hz, uint8_t volume, uint8_t duty) {
    uint16_t envelope = duty_envelope_value(volume, duty);
    uint16_t frequency = (uint16_t)(SOUND_TRIGGER | square_frequency_value(frequency_hz));

    if (channel == 1) {
        REG_SOUND1CNT_L = 0;
        REG_SOUND1CNT_H = envelope;
        REG_SOUND1CNT_X = frequency;
    } else if (channel == 2) {
        REG_SOUND2CNT_L = envelope;
        REG_SOUND2CNT_H = frequency;
    }
}

void gbs_hw_audio_set_square_volume(int channel, uint8_t volume, uint8_t duty) {
    uint16_t envelope = duty_envelope_value(volume, duty);
    if (channel == 1) {
        REG_SOUND1CNT_H = envelope;
    } else if (channel == 2) {
        REG_SOUND2CNT_L = envelope;
    }
}

void gbs_hw_audio_stop_square(int channel) {
    if (channel == 1) {
        REG_SOUND1CNT_H = 0;
        REG_SOUND1CNT_X = 0;
    } else if (channel == 2) {
        REG_SOUND2CNT_L = 0;
        REG_SOUND2CNT_H = 0;
    }
}

void gbs_hw_audio_play_wave(uint16_t frequency_hz, uint8_t volume, uint8_t waveform) {
    uint16_t output_level = 0;
    if (volume >= 10) {
        output_level = 1;
    } else if (volume >= 5) {
        output_level = 2;
    } else if (volume > 0) {
        output_level = 3;
    }

    load_wave_pattern(waveform);
    REG_SOUND3CNT_L = 0x0080;
    REG_SOUND3CNT_H = (uint16_t)(output_level << 13);
    REG_SOUND3CNT_X = (uint16_t)(SOUND_TRIGGER | wave_frequency_value(frequency_hz));
}

void gbs_hw_audio_set_wave_volume(uint8_t volume) {
    uint16_t output_level = 0;
    if (volume >= 10) {
        output_level = 1;
    } else if (volume >= 5) {
        output_level = 2;
    } else if (volume > 0) {
        output_level = 3;
    }
    REG_SOUND3CNT_H = (uint16_t)(output_level << 13);
}

void gbs_hw_audio_stop_wave(void) {
    REG_SOUND3CNT_L = 0;
    REG_SOUND3CNT_H = 0;
    REG_SOUND3CNT_X = 0;
}

void gbs_hw_audio_play_noise(uint16_t frequency_hz, uint8_t volume, uint8_t duty) {
    if (volume > 15) {
        volume = 15;
    }
    REG_SOUND4CNT_L = (uint16_t)(volume << 12);
    REG_SOUND4CNT_H = (uint16_t)(SOUND_TRIGGER | noise_frequency_value(frequency_hz) | ((duty & 1u) << 3));
}

void gbs_hw_audio_set_noise_volume(uint8_t volume) {
    if (volume > 15) {
        volume = 15;
    }
    REG_SOUND4CNT_L = (uint16_t)(volume << 12);
}

void gbs_hw_audio_stop_noise(void) {
    REG_SOUND4CNT_L = 0;
    REG_SOUND4CNT_H = 0;
}

void gbs_hw_audio_play_pcm8(const uint8_t* samples, uint32_t sample_count, uint32_t sample_rate_hz, int loop) {
    if (samples == 0 || sample_count == 0 || sample_count > 0xFFFFu) {
        return;
    }

    gbs_hw_audio_start_pcm8_stream(sample_rate_hz);
    gbs_hw_audio_submit_pcm8_stream_block(samples, sample_count);

    if (loop) {
        volatile uint32_t* dma = (volatile uint32_t*)(DMA_BASE + 1 * 12);
        dma[2] = dma[2] | DMA_REPEAT;
    }
}

void gbs_hw_audio_start_pcm8_stream(uint32_t sample_rate_hz) {
    if (sample_rate_hz < 4000u) {
        sample_rate_hz = 4000u;
    }
    if (sample_rate_hz > 32768u) {
        sample_rate_hz = 32768u;
    }

    volatile uint32_t* dma = (volatile uint32_t*)(DMA_BASE + 1 * 12);
    dma[2] = 0;
    volatile uint32_t* dma_b = (volatile uint32_t*)(DMA_BASE + 2 * 12);
    dma_b[2] = 0;
    pcm_dma_block_started = 0;
    gbs_hw_timer_stop(1);
    REG_SOUNDCNT_X = 0x0080;
    REG_SOUNDCNT_H = (uint16_t)(REG_SOUNDCNT_H & ~((1u << 8) | (1u << 9) | (1u << 10) | (1u << 11) |
        (1u << 12) | (1u << 13) | (1u << 14) | (1u << 15)));
    REG_SOUNDCNT_H = (uint16_t)(REG_SOUNDCNT_H | (1u << 2) | (1u << 8) | (1u << 9) | (1u << 10));
    REG_SOUNDCNT_H = (uint16_t)(REG_SOUNDCNT_H | (1u << 11));
    REG_SOUNDCNT_H = (uint16_t)(REG_SOUNDCNT_H & ~(1u << 11));
    REG_FIFO_A = 0;

    uint32_t timer_ticks = 16777216u / sample_rate_hz;
    if (timer_ticks == 0) {
        timer_ticks = 1;
    }
    if (timer_ticks > 65535u) {
        timer_ticks = 65535u;
    }
    uint16_t reload = (uint16_t)(65536u - timer_ticks);
    REG16(TIMER_BASE + 1 * 4) = reload;
    REG16(TIMER_BASE + 1 * 4 + 2) = TIMER_ENABLE;
}

uint16_t gbs_hw_audio_lock_state(void) {
    const uint16_t previous = REG_IME;
    REG_IME = 0;
    __asm__ volatile ("" ::: "memory");
    return previous;
}

void gbs_hw_audio_unlock_state(uint16_t previous) {
    __asm__ volatile ("" ::: "memory");
    REG_IME = previous;
}

void gbs_hw_audio_start_pcm8_stereo_stream(uint32_t sample_rate_hz) {
    if (sample_rate_hz < 4000u) sample_rate_hz = 4000u;
    if (sample_rate_hz > 32768u) sample_rate_hz = 32768u;

    volatile uint32_t* dma_a = (volatile uint32_t*)(DMA_BASE + 1 * 12);
    volatile uint32_t* dma_b = (volatile uint32_t*)(DMA_BASE + 2 * 12);
    dma_a[2] = 0;
    dma_b[2] = 0;
    pcm_dma_block_started = 0;
    gbs_hw_timer_stop(1);
    REG_SOUNDCNT_X = 0x0080;
    REG_SOUNDCNT_H = (uint16_t)(REG_SOUNDCNT_H & ~((1u << 8) | (1u << 9) | (1u << 10) | (1u << 11) |
        (1u << 12) | (1u << 13) | (1u << 14) | (1u << 15)));
    REG_SOUNDCNT_H = (uint16_t)(REG_SOUNDCNT_H | (1u << 2) | (1u << 3) |
        (1u << 8) | (1u << 10) | (1u << 13) | (1u << 14));
    REG_SOUNDCNT_H = (uint16_t)(REG_SOUNDCNT_H | (1u << 11) | (1u << 15));
    REG_SOUNDCNT_H = (uint16_t)(REG_SOUNDCNT_H & ~((1u << 11) | (1u << 15)));
    REG_FIFO_A = 0;
    REG_FIFO_B = 0;

    uint32_t timer_ticks = 16777216u / sample_rate_hz;
    if (timer_ticks == 0) timer_ticks = 1;
    if (timer_ticks > 65535u) timer_ticks = 65535u;
    REG16(TIMER_BASE + 1 * 4) = (uint16_t)(65536u - timer_ticks);
    pcm_pending_ready = 0;
    pcm_stereo_stream = 1;
    pcm_timer_running = 0;
    pcm_stop_after_pending = 0;
}

void gbs_hw_audio_submit_pcm8_stream_block(const uint8_t* samples, uint32_t sample_count) {
    if (samples == 0 || sample_count == 0 || sample_count > 0xFFFFu) {
        return;
    }

    volatile uint32_t* dma = (volatile uint32_t*)(DMA_BASE + 1 * 12);
    if (pcm_dma_block_started && (dma[2] & DMA_ENABLE) == 0u) {
        ++pcm_underrun_count;
    }
    dma[2] = 0;
    dma[0] = (uint32_t)samples;
    dma[1] = (uint32_t)&REG_FIFO_A;
    uint32_t words = (sample_count + 3u) / 4u;
    dma[2] = words | DMA_DEST_FIXED | DMA_32BIT | DMA_START_SPECIAL | DMA_ENABLE;
    pcm_dma_block_started = 1;
}

void gbs_hw_audio_submit_pcm8_stereo_stream_block(const uint8_t* left_samples, const uint8_t* right_samples, uint32_t sample_count) {
    if (left_samples == 0 || right_samples == 0 || sample_count != 528u) return;
    const uint16_t ime = REG_IME;
    REG_IME = 0;
    pcm_pending_left = left_samples;
    pcm_pending_right = right_samples;
    pcm_pending_ready = 1;
    pcm_stop_after_pending = 0;
    REG_IME = ime;
}

static void commit_pcm_stream_block(void) {
    if (!pcm_stereo_stream) return;
    volatile uint32_t* dma_a = (volatile uint32_t*)(DMA_BASE + 1 * 12);
    volatile uint32_t* dma_b = (volatile uint32_t*)(DMA_BASE + 2 * 12);
    if (!pcm_pending_ready) {
        // A late game frame must never let FIFO DMA run into other memory.
        if (pcm_dma_block_started && !pcm_stop_after_pending) ++pcm_underrun_count;
        dma_a[2] = 0;
        dma_b[2] = 0;
        gbs_hw_timer_stop(1);
        pcm_timer_running = 0;
        pcm_dma_block_started = 0;
        if (pcm_stop_after_pending) {
            pcm_stereo_stream = 0;
            pcm_stop_after_pending = 0;
            REG_SOUNDCNT_H = (uint16_t)(REG_SOUNDCNT_H & ~((1u << 8) | (1u << 9) | (1u << 12) | (1u << 13)));
        }
        return;
    }
    if (pcm_dma_block_started && ((dma_a[2] & DMA_ENABLE) == 0u || (dma_b[2] & DMA_ENABLE) == 0u)) ++pcm_underrun_count;
    dma_a[2] = 0;
    dma_b[2] = 0;
    dma_a[0] = (uint32_t)pcm_pending_right;
    dma_a[1] = (uint32_t)&REG_FIFO_A;
    dma_b[0] = (uint32_t)pcm_pending_left;
    dma_b[1] = (uint32_t)&REG_FIFO_B;
    dma_a[2] = DMA_DEST_FIXED | DMA_REPEAT | DMA_32BIT | DMA_START_SPECIAL | DMA_ENABLE;
    dma_b[2] = DMA_DEST_FIXED | DMA_REPEAT | DMA_32BIT | DMA_START_SPECIAL | DMA_ENABLE;
    pcm_pending_ready = 0;
    pcm_dma_block_started = 1;
    if (!pcm_timer_running) {
        REG16(TIMER_BASE + 1 * 4 + 2) = TIMER_ENABLE;
        pcm_timer_running = 1;
    }
}

void gbs_hw_audio_stop_pcm(void) {
    gbs_hw_audio_stop_pcm8_stream();
}

void gbs_hw_audio_finish_pcm8_stereo_stream(void) {
    if (pcm_stereo_stream) pcm_stop_after_pending = 1;
}

void gbs_hw_audio_stop_pcm8_stream(void) {
    pcm_stereo_stream = 0;
    pcm_pending_ready = 0;
    pcm_timer_running = 0;
    pcm_stop_after_pending = 0;
    volatile uint32_t* dma_a = (volatile uint32_t*)(DMA_BASE + 1 * 12);
    volatile uint32_t* dma_b = (volatile uint32_t*)(DMA_BASE + 2 * 12);
    dma_a[2] = 0;
    dma_b[2] = 0;
    pcm_dma_block_started = 0;
    gbs_hw_timer_stop(1);
    REG_SOUNDCNT_H = (uint16_t)(REG_SOUNDCNT_H & ~((1u << 8) | (1u << 9) | (1u << 10) | (1u << 11) |
        (1u << 12) | (1u << 13) | (1u << 14) | (1u << 15)));
}

uint32_t gbs_hw_audio_pcm_underrun_count(void) {
    return pcm_underrun_count;
}

void gbs_hw_dma_copy(int channel, const void* source, volatile void* destination, uint32_t units, int word_sized) {
    if (channel < 0 || channel > 3 || source == 0 || destination == 0 || units == 0 || units > 0x3FFF) {
        return;
    }
    if ((hblank_dma_active_mask & (1u << channel)) != 0u) {
        return;
    }

    volatile uint32_t* dma = (volatile uint32_t*)(DMA_BASE + channel * 12);
    gbs_hw_dma_wait(channel);
    dma[2] = 0;
    dma[0] = (uint32_t)source;
    dma[1] = (uint32_t)destination;
    dma[2] = units | DMA_ENABLE | (word_sized ? DMA_32BIT : 0);
}

void gbs_hw_hdma_start(int channel, const void* source, volatile void* destination, uint32_t units, int word_sized) {
    if (channel < 0 || channel > 3 || source == 0 || destination == 0 || units == 0 || units > 0x3FFF) {
        return;
    }
    volatile uint32_t* dma = (volatile uint32_t*)(DMA_BASE + channel * 12);
    dma[2] = 0;
    dma[0] = (uint32_t)source;
    dma[1] = (uint32_t)destination;
    dma[2] = units | DMA_DEST_FIXED | DMA_REPEAT | DMA_START_HBLANK | DMA_ENABLE | (word_sized ? DMA_32BIT : 0);
    hblank_dma_active_mask = (uint8_t)(hblank_dma_active_mask | (1u << channel));
}

void gbs_hw_hdma_stop(int channel) {
    if (channel < 0 || channel > 3) {
        return;
    }
    volatile uint32_t* dma = (volatile uint32_t*)(DMA_BASE + channel * 12);
    dma[2] = 0;
    hblank_dma_active_mask = (uint8_t)(hblank_dma_active_mask & ~(1u << channel));
}

uint32_t* gbs_hw_hblank_affine_buffer(void) {
    return affine_hblank_words[affine_hblank_active_buffer^1u];
}

void gbs_hw_start_hblank_affine(int layer,const uint32_t* words) {
    if((layer!=2 && layer!=3)||words==0)return;
    uint32_t* pending=affine_hblank_words[affine_hblank_active_buffer^1u];
    if(words!=pending) for(unsigned i=0;i<161u*4u;++i)pending[i]=words[i];
    affine_hblank_layer=(uint8_t)layer;
    affine_hblank_enabled=1;
    pending_hblank_scroll_enabled=0;
    pending_hblank_scroll_dirty=1;
}

void gbs_hw_start_hblank_bg_scroll(int layer, const int16_t* offsets) {
    if (layer < 0 || layer > 3 || offsets == 0) {
        return;
    }
    affine_hblank_enabled=0;
    pending_hblank_scroll_layer = layer;
    pending_hblank_scroll_offsets = offsets;
    pending_hblank_scroll_enabled = 1;
    pending_hblank_scroll_dirty = 1;
}

void gbs_hw_disable_hblank_effects(void) {
    affine_hblank_enabled=0;
    pending_hblank_scroll_enabled = 0;
    pending_hblank_scroll_dirty = 1;
}

int gbs_hw_get_vcount(void) {
    return REG_VCOUNT;
}

void gbs_hw_apply_affine_bg_raster_line(
    int layer,
    int16_t pa,
    int16_t pc,
    int32_t reference_x_8,
    int32_t reference_y_8
) {
    volatile uint16_t* matrix = affine_bg_matrix_registers(layer);
    volatile uint32_t* reference = affine_bg_reference_registers(layer);
    if (matrix == 0 || reference == 0) {
        return;
    }
    matrix[0] = (uint16_t)pa;
    matrix[1] = 0;
    matrix[2] = (uint16_t)pc;
    matrix[3] = 0;
    reference[0] = (uint32_t)reference_x_8;
    reference[1] = (uint32_t)reference_y_8;
}

void gbs_hw_timer_start(int timer, uint16_t reload, uint16_t frequency, int irq_on_overflow, int cascade) {
    if (timer < 0 || timer > 3) {
        return;
    }

    volatile uint16_t* timer_register = (volatile uint16_t*)(TIMER_BASE + timer * 4);
    uint16_t control = (uint16_t)(frequency & 3u);
    if (irq_on_overflow) {
        control |= TIMER_IRQ;
    }
    if (cascade) {
        control |= TIMER_CASCADE;
    }

    timer_register[1] = 0;
    timer_register[0] = reload;
    timer_register[1] = (uint16_t)(control | TIMER_ENABLE);
}

void gbs_hw_timer_stop(int timer) {
    if (timer < 0 || timer > 3) {
        return;
    }

    volatile uint16_t* timer_register = (volatile uint16_t*)(TIMER_BASE + timer * 4);
    timer_register[1] = 0;
}

uint16_t gbs_hw_timer_value(int timer) {
    if (timer < 0 || timer > 3) {
        return 0;
    }

    volatile uint16_t* timer_register = (volatile uint16_t*)(TIMER_BASE + timer * 4);
    return timer_register[0];
}
