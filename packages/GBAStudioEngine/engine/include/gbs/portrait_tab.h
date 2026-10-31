#pragma once

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Reserved only in scenes opting into portrait_tab. World OBJ assets must end
 * below tile 512 and palette entry 240. Portraits retain OAM 110..113. */
enum { GBS_PORTRAIT_TAB_TILE_BASE = 512, GBS_PORTRAIT_TAB_TILE_COUNT = 384,
    GBS_PORTRAIT_TAB_OAM_BASE = 114, GBS_PORTRAIT_TAB_OAM_COUNT = 8 };
/* The exporting runtime owns this scratch area in its EWRAM overlay. A scene
 * without the opt-in reserves no raster, so large unrelated runtimes keep
 * their existing memory budget. */
struct GbsPortraitTabWorkspace {
    uint16_t tiles[GBS_PORTRAIT_TAB_TILE_COUNT * 16];
    uint16_t colors[16];
    int active, portrait, right;
    char speaker[128], text[1024];
    const uint8_t* font;
    const uint16_t* palette;
};
void gbs_portrait_tab_set_workspace(void* memory, size_t size);
void gbs_portrait_tab_order_oam(const uint16_t* source, uint16_t* output);
void gbs_portrait_tab_draw(const char* speaker, const char* text, int visible,
    int portrait, int right, const uint8_t* font, const uint16_t* skin_palette);

#ifdef __cplusplus
}
#endif
