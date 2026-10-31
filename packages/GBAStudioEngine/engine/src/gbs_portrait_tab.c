#include "gbs/portrait_tab.h"
#include "gbs/portrait_tab_frame_data.h"
#include "gbs/text.h"
#include "gbs_hw.h"
#include <string.h>

/* Four 64x64 and four 64x32 OBJ parts. The raster contains interface pixels
 * only; world BG and portrait OBJ assets stay independently authored/loaded. */
static struct GbsPortraitTabWorkspace* workspace;
static int sprites_visible;
#define display_tiles workspace->tiles
#define colors workspace->colors
#define active workspace->active
#define cached_portrait workspace->portrait
#define cached_right workspace->right
#define cached_speaker workspace->speaker
#define cached_text workspace->text
#define cached_font workspace->font
#define cached_palette workspace->palette

void gbs_portrait_tab_set_workspace(void* memory, size_t size) {
    if (sprites_visible) gbs_hw_hide_sprites(GBS_PORTRAIT_TAB_OAM_BASE,GBS_PORTRAIT_TAB_OAM_COUNT);
    sprites_visible=0;
    workspace = size >= sizeof(struct GbsPortraitTabWorkspace) ? (struct GbsPortraitTabWorkspace*)memory : 0;
    if (workspace) memset(workspace,0,sizeof(*workspace));
}

void gbs_portrait_tab_order_oam(const uint16_t* source, uint16_t* output) {
    for (int i = 0; i < 128; ++i) {
        /* Portrait and tab first; retain the relative order of world sprites. */
        const int original = i < 12 ? 110 + i : (i < 122 ? i - 12 : i);
        output[i * 4] = source[original * 4];
        output[i * 4 + 1] = source[original * 4 + 1];
        output[i * 4 + 2] = source[original * 4 + 2];
        /* Attribute 3 belongs to affine matrices, not to each sprite. */
        output[i * 4 + 3] = source[i * 4 + 3];
    }
}

/* Roles 1..8: outline, rim, inner edge, fill, header, text, name, selection. */
#define RGB15(r,g,b) ((r)/8 | ((g)/8 << 5) | ((b)/8 << 10))
static const uint16_t default_colors[9] = {0, RGB15(7,29,39), RGB15(202,187,137),
    RGB15(30,91,104), RGB15(15,48,62), RGB15(20,62,75), RGB15(244,237,211),
    RGB15(239,203,127), RGB15(29,70,80)};

static unsigned pixel_offset(int x, int y) {
    const unsigned part = (unsigned)x / 64;
    const unsigned tile = y < 64 ? part * 64 + (unsigned)y / 8 * 8 + (unsigned)(x % 64) / 8
        : 256 + part * 32 + (unsigned)(y - 64) / 8 * 8 + (unsigned)(x % 64) / 8;
    return tile * 32 + (unsigned)(y % 8) * 4 + (unsigned)(x % 8) / 2;
}
static void pixel(uint16_t* tiles, int x, int y, unsigned color) {
    if (x < 0 || x >= 256 || y < 0 || y >= 96) return;
    uint8_t* bytes = (uint8_t*)tiles;
    const unsigned offset = pixel_offset(x,y), shift = (unsigned)(x & 1) * 4;
    bytes[offset] = (uint8_t)((bytes[offset] & ~(15u << shift)) | (color << shift));
}
static void rectangle(uint16_t* tiles, int x, int y, int w, int h, unsigned color) {
    if ((x|y|w|h)%8==0) {
        for (int yy=y; yy<y+h; yy+=8) for(int xx=x;xx<x+w;xx+=8)
            memset((uint8_t*)tiles+pixel_offset(xx,yy),(int)(color|(color<<4)),32);
        return;
    }
    for (int yy=y; yy<y+h; ++yy) for (int xx=x; xx<x+w; ++xx) pixel(tiles,xx,yy,color);
}
static void glyph(uint16_t* tiles, unsigned id, int x, int y, unsigned color, const uint8_t* font) {
    if ((x&7)==0 && (y&7)==0 && x>=0 && x<256 && y>=0 && y<96) {
        uint8_t* output=(uint8_t*)tiles+pixel_offset(x,y);
        for (int yy=0; yy<8; ++yy) for (int pair=0; pair<4; ++pair) {
            const unsigned bits=font ? font[id*32+yy*4+pair]
                : (((gbs_font_rows[id][yy]>>(7-pair*2))&1) | (((gbs_font_rows[id][yy]>>(6-pair*2))&1)<<4));
            unsigned value=output[yy*4+pair];
            if (bits&15) value=(value&240)|color;
            if (bits&240) value=(value&15)|(color<<4);
            output[yy*4+pair]=(uint8_t)value;
        }
        return;
    }
    for (int yy=0; yy<8; ++yy) for (int xx=0; xx<8; ++xx) {
        const int ink = font ? ((font[id*32+yy*4+xx/2] >> ((xx&1)*4)) & 15)
            : ((gbs_font_rows[id][yy] >> (7-xx)) & 1);
        if (ink) pixel(tiles,x+xx,y+yy,color);
    }
}
static void name_text(const char* text, int x, const uint8_t* font) {
    for (int i=0; *text && i<19; ++i) glyph(display_tiles,gbs_text_glyph_index(gbs_text_next_codepoint(&text)),x+i*8,44,7,font);
}
static void choose_colors(const uint16_t* palette) {
    memset(colors,0,sizeof(colors));
    for (int role=1; role<=8; ++role) {
        colors[role] = default_colors[role];
        if (!palette) continue;
        unsigned best=~0u;
        for (int i=1; i<16; ++i) {
            const int r=(palette[i]&31)-(default_colors[role]&31);
            const int g=((palette[i]>>5)&31)-((default_colors[role]>>5)&31);
            const int b=((palette[i]>>10)&31)-((default_colors[role]>>10)&31);
            const unsigned error=(unsigned)(r*r+g*g+b*b);
            if (error<best) {best=error; colors[role]=palette[i];}
        }
    }
}
static void build_frame(const char* speaker, int portrait, int right, const uint8_t* font) {
    int letters=(int)gbs_text_codepoint_count(speaker);
    if (letters>19) letters=19;
    const int mode=portrait?(right?2:1):0;
    const uint8_t* input=portrait_tab_frame_rle+portrait_tab_frame_offsets[mode*20+letters];
    uint8_t* output=(uint8_t*)display_tiles;
    unsigned written=0;
    while (written<sizeof(display_tiles)) {
        const unsigned count=(unsigned)input[0]+((unsigned)input[1]<<8);
        memset(output+written,input[2],count);
        written+=count; input+=3;
    }
    if (letters) name_text(speaker,(portrait?(right?168-(letters*8+16):56):0)+8,font);

}

void gbs_portrait_tab_draw(const char* speaker, const char* text, int visible,
    int portrait, int right, const uint8_t* font, const uint16_t* palette) {
    if (!workspace) return;
    if (!visible) {
        if (active) gbs_hw_hide_sprites(GBS_PORTRAIT_TAB_OAM_BASE,GBS_PORTRAIT_TAB_OAM_COUNT);
        active=0; sprites_visible=0; cached_portrait=-1; return;
    }
    if (!speaker) speaker="";
    if (!text) text="";
    const int frame_changed=!active || portrait!=cached_portrait || right!=cached_right || font!=cached_font || palette!=cached_palette || strcmp(speaker,cached_speaker);
    if (frame_changed) {
        build_frame(speaker,portrait,right,font); choose_colors(palette);
        strncpy(cached_speaker,speaker,sizeof(cached_speaker)-1);
        cached_portrait=portrait; cached_right=right; cached_font=font; cached_palette=palette;
    }
    if (frame_changed || strcmp(text,cached_text)) {
        rectangle(display_tiles,8,64,208,24,4);
        const char* cursor=text; int row=0,column=0;
        while (*cursor && row<3) {
            const uint32_t cp=gbs_text_next_codepoint(&cursor);
            if (cp=='\n') {++row;column=0;continue;}
            if (column>=26) {++row;column=0;if(row>=3)break;}
            if (row>0 && column==0 && (cp=='!' || cp=='-')) {
                if (cp=='!') {
                    rectangle(display_tiles,18,64+row*8,198,8,8);
                    for(int y=1;y<7;++y) for(int x=0;x<(y<7-y?y:7-y);++x) pixel(display_tiles,9+x,64+row*8+y,7);
                }
            } else glyph(display_tiles,gbs_text_glyph_index(cp),8+column*8,64+row*8,6,font);
            ++column;
        }
        strncpy(cached_text,text,sizeof(cached_text)-1);
        if (frame_changed) gbs_hw_load_obj_tiles((const uint8_t*)display_tiles,GBS_PORTRAIT_TAB_TILE_BASE,GBS_PORTRAIT_TAB_TILE_COUNT);
        else gbs_hw_load_obj_tiles((const uint8_t*)display_tiles+256*32,GBS_PORTRAIT_TAB_TILE_BASE+256,128);
    }
    gbs_hw_load_obj_palette(colors,240,16);
    for (int i=0;i<8;++i) {
        const int bottom=i>=4, column=i%4;
        gbs_hw_set_sprite(GBS_PORTRAIT_TAB_OAM_BASE+i,8+column*64,56+bottom*64,
            (uint16_t)(GBS_PORTRAIT_TAB_TILE_BASE+(bottom?256:0)+column*(bottom?32:64)),15,0,0,1,1,0,0,bottom?1:0,3);
        gbs_hw_set_sprite_color_depth(GBS_PORTRAIT_TAB_OAM_BASE+i,0);
    }
    active=1; sprites_visible=1;
}
