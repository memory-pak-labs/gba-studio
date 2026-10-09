#pragma once

#include <stddef.h>
#include <stdbool.h>

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum {
    GBS_HW_HUD_COMPONENT_FRAME = 0,
    GBS_HW_HUD_COMPONENT_TEXT = 1,
    GBS_HW_HUD_COMPONENT_BAR = 2,
    GBS_HW_HUD_COMPONENT_ICON = 3
};

void gbs_hw_init(void);
void gbs_hw_wait_vblank(void);
void gbs_hw_set_render_publication_blocked(int blocked);
void gbs_hw_set_render_handoff_fallback(void);
void gbs_hw_frame_counter_init(void);
uint32_t gbs_hw_frame_counter_ticks(void);
void gbs_hw_set_backdrop(uint16_t color);
uint16_t gbs_hw_get_backdrop(void);
uint16_t gbs_hw_read_keys(void);
int gbs_hw_consume_keypad_irq(void);
int gbs_hw_keypad_irq_pending(void);
void gbs_hw_clear_keypad_irq(void);
void gbs_hw_set_bg_scroll(int layer, int x, int y);
void gbs_hw_set_bg_character_base(int layer, uint16_t character_base);
void gbs_hw_set_bg_color_depth(int layer, int indexed);
void gbs_hw_set_ui_character_base(uint16_t base);
void gbs_hw_load_bg_tiles_8bpp(const uint8_t* data, uint32_t tile, uint32_t count, uint16_t base);
void gbs_hw_set_bg_screen_base(int layer, uint16_t screen_base);
void gbs_hw_load_bg_tiles_at_character_base(const uint8_t* data, uint32_t destination_tile, uint32_t tile_count, uint16_t character_base);
void gbs_hw_set_bg_enabled(int layer, int enabled);
void gbs_hw_hide_all_sprites(void);
void gbs_hw_hide_sprites(int first, int count);
void gbs_hw_set_sprite(int index, int x, int y, uint16_t tile_index, uint16_t palette, int hflip, int vflip, int visible, uint16_t priority, uint16_t mode, int mosaic, uint16_t shape, uint16_t size);
void gbs_hw_set_sprite_color_depth(int index, int eight_bpp);
void gbs_hw_set_sprite_affine(int index, int enabled, int double_size, uint16_t matrix_index);
void gbs_hw_set_sprite_affine_matrix(uint16_t matrix_index, int16_t pa, int16_t pb, int16_t pc, int16_t pd);
uint32_t gbs_hw_oam_overflow_count(void);
void gbs_hw_reset_oam_overflow_count(void);
void gbs_hw_demo_tiles(void);
void gbs_hw_restore_ui_assets(void);
void gbs_hw_draw_room_to_bg0(const uint8_t* tiles, int width, int height, int camera_x, int camera_y);
void gbs_hw_draw_room16_to_bg0(const uint16_t* tiles, int width, int height, int camera_x, int camera_y);
void gbs_hw_draw_room_to_bg(int layer, const uint8_t* tiles, int width, int height, int camera_x, int camera_y);
void gbs_hw_draw_room16_to_bg(int layer, const uint16_t* tiles, int width, int height, int camera_x, int camera_y);
void gbs_hw_draw_dialogue_box(const char* text, int visible);
void gbs_hw_draw_text_box(int x, int y, int width, int height, const char* text, int visible);
void gbs_hw_draw_text_at(int x, int y, int width, const char* text);
void gbs_hw_draw_text_overlay(int x, int y, int width, const char* text, int visible);
void gbs_hw_draw_text_overlay_slot(int x, int y, int width, const char* text, int oam_offset, int visible);
void gbs_hw_draw_text_overlay_light(int x, int y, int width, const char* text, int visible);
void gbs_hw_draw_text_input_surface(int x, int y, int width, int height, int visible);
void gbs_hw_draw_text_input_keyboard(int x, int y, int width, int height, int selected_index, int lowercase, int visible);
void gbs_hw_draw_text_input_keyboard_with_controls(int x, int y, int width, int height, int selected_index, int lowercase, int visible, int control_layout, int controls_x, int controls_y, int controls_width, int controls_height, int surface);
void gbs_hw_draw_overlay_rect(int x, int y, int width, int height, int visible);
void gbs_hw_configure_dialogue_box_skin(const uint8_t* tiles, const uint16_t* palette);
void gbs_hw_configure_hud_box_skin(const uint8_t* tiles, const uint16_t* palette);
void gbs_hw_configure_hud_box(int x, int y, int width, int height);
void gbs_hw_invalidate_hud_layout(void);
void gbs_hw_begin_hud_layout(int visible);
void gbs_hw_draw_hud_layout_component(int kind, int x, int y, int width, int height, const char* text, int text_slot, const void* metasprite, int visible);
void gbs_hw_end_hud_layout(void);
void gbs_hw_configure_dialogue_font(const uint8_t* tiles);
void gbs_hw_set_bg_font_transparent(int enabled);
void gbs_hw_configure_dialogue_choice_selector(const uint8_t* tile);
void gbs_hw_draw_hud_bar(const char* left_text, const char* right_text, int visible);
void gbs_hw_audio_init(void);
void gbs_hw_audio_play_square(int channel, uint16_t frequency_hz, uint8_t volume, uint8_t duty);
void gbs_hw_audio_set_square_volume(int channel, uint8_t volume, uint8_t duty);
void gbs_hw_audio_stop_square(int channel);
void gbs_hw_audio_play_wave(uint16_t frequency_hz, uint8_t volume, uint8_t waveform);
void gbs_hw_audio_set_wave_volume(uint8_t volume);
void gbs_hw_audio_stop_wave(void);
void gbs_hw_audio_play_noise(uint16_t frequency_hz, uint8_t volume, uint8_t duty);
void gbs_hw_audio_set_noise_volume(uint8_t volume);
void gbs_hw_audio_stop_noise(void);
void gbs_hw_audio_set_psg_pan(int channel, int pan);
/* PCM FIFO buffers are unsigned 8-bit samples centered at 0x80. */
void gbs_hw_audio_play_pcm8(const uint8_t* samples, uint32_t sample_count, uint32_t sample_rate_hz, int loop);
void gbs_hw_audio_stop_pcm(void);
void gbs_hw_audio_start_pcm8_stream(uint32_t sample_rate_hz);
void gbs_hw_audio_submit_pcm8_stream_block(const uint8_t* samples, uint32_t sample_count);
uint16_t gbs_hw_audio_lock_state(void);
void gbs_hw_audio_unlock_state(uint16_t previous);
void gbs_hw_audio_start_pcm8_stereo_stream(uint32_t sample_rate_hz);
void gbs_hw_audio_submit_pcm8_stereo_stream_block(const uint8_t* left_samples, const uint8_t* right_samples, uint32_t sample_count);
void gbs_hw_audio_finish_pcm8_stereo_stream(void);
void gbs_hw_audio_stop_pcm8_stream(void);
uint32_t gbs_hw_audio_pcm_underrun_count(void);
void gbs_hw_load_bg_palette(const uint16_t* colors, uint32_t start_index, uint32_t color_count);
void gbs_hw_load_obj_palette(const uint16_t* colors, uint32_t start_index, uint32_t color_count);
void gbs_hw_load_bg_tiles(const uint8_t* data, uint32_t destination_tile, uint32_t tile_count);
void gbs_hw_load_obj_tiles(const uint8_t* data, uint32_t destination_tile, uint32_t tile_count);
void gbs_hw_load_obj_tiles_8bpp(const uint8_t* data, uint32_t destination_tile, uint32_t tile_count);
void gbs_hw_load_bg_tilemap(int layer, const uint16_t* entries, uint32_t width, uint32_t height, uint32_t map_size);
void gbs_hw_set_bg_tilemap_entry(int layer, uint32_t x, uint32_t y, uint32_t width, uint32_t height, uint16_t tile);
void gbs_hw_load_affine_bg_tiles(const uint8_t* data, uint32_t destination_tile, uint32_t tile_count);
void gbs_hw_load_affine_bg_tiles_for_layer(int layer, const uint8_t* data, uint32_t destination_tile, uint32_t tile_count);
void gbs_hw_load_affine_bg_tilemap(int layer, const uint8_t* entries, uint32_t width, uint32_t height, uint32_t map_size);
void gbs_hw_set_display_mode(uint16_t mode);
void gbs_hw_set_affine_bg_wrap(int layer, int enabled);
void gbs_hw_set_affine_bg_transform(int layer, int16_t pa, int16_t pb, int16_t pc, int16_t pd, int32_t reference_x_8, int32_t reference_y_8);
void gbs_hw_load_bitmap16(uint16_t mode, const uint16_t* pixels, uint16_t width, uint16_t height, uint16_t page);
void gbs_hw_load_bitmap8(const uint8_t* pixels, uint16_t width, uint16_t height, uint16_t page);
void gbs_hw_fill_bitmap16(uint16_t mode, uint16_t color, uint16_t page);
void gbs_hw_update_bitmap16_rect(uint16_t mode, uint16_t page, uint16_t x, uint16_t y, uint16_t width, uint16_t height, const uint16_t* pixels, uint16_t stride);
void gbs_hw_update_bitmap8_rect(uint16_t page, uint16_t x, uint16_t y, uint16_t width, uint16_t height, const uint8_t* pixels, uint16_t stride);
void gbs_hw_set_display_frame_page(uint16_t page);
void gbs_hw_set_bg_priority(int layer, uint16_t priority);
void gbs_hw_set_bg_mosaic(int layer, int enabled);
void gbs_hw_set_blending(uint16_t first_targets, uint16_t second_targets, uint16_t mode, uint16_t eva, uint16_t evb, uint16_t intensity);
void gbs_hw_disable_blending(void);
void gbs_hw_set_mosaic(uint16_t bg_x, uint16_t bg_y, uint16_t obj_x, uint16_t obj_y);
void gbs_hw_disable_mosaic(void);
void gbs_hw_set_window0(uint16_t left, uint16_t right, uint16_t top, uint16_t bottom, uint16_t inside_mask, uint16_t outside_mask, int enabled);
void gbs_hw_set_window1(uint16_t left, uint16_t right, uint16_t top, uint16_t bottom, uint16_t inside_mask, uint16_t outside_mask, int enabled);
void gbs_hw_set_obj_window(uint16_t inside_mask, uint16_t outside_mask, int enabled);
void gbs_hw_dma_copy(int channel, const void* source, volatile void* destination, uint32_t units, int word_sized);
void gbs_hw_hdma_start(int channel, const void* source, volatile void* destination, uint32_t units, int word_sized);
void gbs_hw_hdma_stop(int channel);
void gbs_hw_start_hblank_bg_scroll(int layer, const int16_t* offsets);
void gbs_hw_disable_hblank_effects(void);
void gbs_hw_start_hblank_affine(int layer, const uint32_t* words);
uint32_t* gbs_hw_hblank_affine_buffer(void);
int gbs_hw_get_vcount(void);
void gbs_hw_apply_affine_bg_raster_line(int layer, int16_t pa, int16_t pc, int32_t reference_x_8, int32_t reference_y_8);
void gbs_hw_timer_start(int timer, uint16_t reload, uint16_t frequency, int irq_on_overflow, int cascade);
void gbs_hw_timer_stop(int timer);
uint16_t gbs_hw_timer_value(int timer);
void gbs_hw_enable_interrupt_source(int source);
void gbs_hw_disable_interrupt_source(int source);
void gbs_hw_sio_normal8_init(int internal_clock);
int gbs_hw_sio_normal8_transfer(uint8_t outgoing, int internal_clock, uint32_t timeout_frames, uint8_t* incoming);
int gbs_hw_sio_normal32_transfer(uint32_t outgoing, int internal_clock, uint32_t timeout_frames, uint32_t* incoming);
int gbs_hw_sio_multiplayer_init(void);
int gbs_hw_sio_multiplayer_transfer(uint16_t outgoing, uint32_t timeout_frames,
                                    uint16_t received[4], uint8_t* player_id,
                                    uint8_t* connected_mask);
void gbs_hw_sio_close(void);
void gbs_hw_flush_vram_writes(void);
bool gbs_hw_enqueue_vblank_dma16(const void* source, volatile void* destination, uint32_t halfwords);
size_t gbs_hw_flush_vblank_dma_queue(int channel);

#ifdef __cplusplus
}
#endif
