"""Run the hardware affine loader against host VRAM with a stale regular-map publication."""
from pathlib import Path
import subprocess
import tempfile
root = Path(__file__).resolve().parents[2]
source = (root/'engine/src/gbs_hw.c').read_text()
start = source.index('void gbs_hw_load_affine_bg_tilemap(')
end = source.index('\nvoid gbs_hw_set_display_mode(', start)
selector = source[source.index('bool gbs_hw_set_affine_map_screen_base('):start]
loader = source[start:end].replace('(volatile uint16_t*)(0x06000000 + affine_screenblock_base * 0x800)', 'fake_vram + affine_screenblock_base * 0x400')
commit_start=source.index('static void commit_shadow_bg_tilemaps(')
commit_end=source.index('static void commit_shadow_bg_scroll(',commit_start)
commit=source[commit_start:commit_end]
mode_start=source.index('void gbs_hw_set_display_mode(')
mode=source[mode_start:source.index('void gbs_hw_set_affine_bg_wrap(',mode_start)]
fallback_start=source.index('void gbs_hw_set_render_handoff_fallback(')
fallback=source[fallback_start:source.index('void gbs_hw_flush_vram_writes(',fallback_start)]
wait_start=source.index('void gbs_hw_wait_vblank(')
wait=source[wait_start:source.index('void gbs_hw_set_render_publication_blocked(',wait_start)]
backdrop_start=source.index('void gbs_hw_set_backdrop(')
backdrop=source[backdrop_start:source.index('uint16_t gbs_hw_get_backdrop(',backdrop_start)]
palette_start=source.index('void gbs_hw_load_bg_palette(')
palette=source[palette_start:source.index('void gbs_hw_load_obj_palette(',palette_start)]
fixture = r'''
#include <cassert>
#include <cstdint>
#include <cstring>
uint16_t fake_vram[32768]{};
uint8_t shadow_bg_map_size[4]{}, shadow_bg_depth[4]{}, bg_screenblocks[4]{};
uint8_t shadow_bg_map_size_pending_mask=0,shadow_bg_depth_mask=0,shadow_bg_screen_base_pending_mask=0;
uint8_t shadow_bg_tilemap_pending_mask=0;
uint16_t shadow_bg_tilemaps[4][1024]{}; uint16_t ui_character_base=0;
bool affine_ui_blank_alias_active=true;constexpr uint16_t UI_TRANSPARENT_TILE=1023;
uint16_t fake_dispcnt=1; uint16_t shadow_display_mode=0, shadow_backdrop_color=0;
constexpr uint16_t affine_screenblock_base=0;
#define REG_DISPCNT fake_dispcnt
#define MEM_VRAM fake_vram
void gbs_hw_mark_ui_tilemap_dirty() { shadow_bg_tilemap_pending_mask|=1; }
volatile uint16_t* screenblock_address(uint16_t block) { return fake_vram+block*1024; }
void gbs_hw_dma_copy(int,const void* from,volatile uint16_t* to,uint32_t words,int) { std::memcpy((void*)to,from,words*2); }
uint16_t affine_upload_screenblock_base=24;
uint32_t affine_screenblock_count_for_map_size(uint32_t size) { return size<4 ? (size<2?1: size==2?2:8) : 0; }
void gbs_hw_enqueue_vblank_dma16(const void* from,volatile uint16_t* to,uint32_t words) { std::memcpy((void*)to,from,words*2); }
''' + selector + loader + commit + mode + r'''
uint16_t fake_palette[256]{}, fake_control=0, fake_ie=1, fake_status=8, fake_vcount=160;
uint16_t shadow_bg_enabled_bits=0x500;
uint8_t render_publication_blocked=0, render_handoff_fallback_active=0;
#define MEM_PALETTE fake_palette
#define REG_BLDCNT fake_control
#define REG_BLDALPHA fake_control
#define REG_BLDY fake_control
#define REG_MOSAIC fake_control
#define REG_IE fake_ie
#define REG_DISPSTAT fake_status
#define REG_VCOUNT fake_vcount
void gbs_bios_vblank_intr_wait() {}
void commit_shadow_bg_controls() {}
void commit_shadow_oam() {}
void commit_shadow_bg_scroll() {}
void commit_hblank_bg_scroll() {}
void commit_pcm_stream_block() {}
void gbs_audio_vblank_update() {}
void gbs_emit_vblank_interrupt() {}
''' + backdrop + palette + fallback + wait + r'''
int main() {
 bg_screenblocks[0]=24;bg_screenblocks[1]=28;
 shadow_bg_tilemaps[0][1]=0xf123;shadow_bg_tilemap_pending_mask=3;
 commit_shadow_bg_tilemaps();
 assert(fake_vram[24*1024]==UI_TRANSPARENT_TILE); // tile zero now contains affine map bytes, not transparent UI art
 assert(fake_vram[24*1024+1]==0xf123 && fake_vram[28*1024]==0);
 gbs_hw_set_display_mode(0);
 assert(shadow_bg_tilemaps[0][0]==0 && shadow_bg_tilemaps[0][1]==0xf123);
 commit_shadow_bg_tilemaps();assert(fake_vram[24*1024]==0);
 fake_vram[1023*16]=0xffff;gbs_hw_set_display_mode(1);assert(fake_vram[1023*16]==0);commit_shadow_bg_tilemaps();assert(fake_vram[24*1024]==UI_TRANSPARENT_TILE);
 const uint8_t map[256]={1,2,3};
 for(int layer: {2,3}) {
  shadow_bg_tilemap_pending_mask=static_cast<uint8_t>(1u | (1u<<layer));
  gbs_hw_load_affine_bg_tilemap(layer,map,16,16,0);
  assert(shadow_bg_tilemap_pending_mask==1); // BG0 survives; stale regular data cannot overwrite affine bytes
  assert(fake_vram[24*0x400]==0x0201);
 }
 shadow_bg_tilemap_pending_mask=5;
 gbs_hw_load_affine_bg_tilemap(2,map,24,24,0);
 assert(shadow_bg_tilemap_pending_mask==5);
 assert(!gbs_hw_set_affine_map_screen_base(24));
 assert(gbs_hw_set_affine_map_screen_base(28));
 fake_vram[16]=0xbeef;
 gbs_hw_load_affine_bg_tilemap(2,map,16,16,0);
 assert(fake_vram[16]==0xbeef && fake_vram[28*1024]==0x0201);
 shadow_bg_tilemap_pending_mask=5;
 gbs_hw_load_affine_bg_tilemap(2,map,128,128,3);
 assert(shadow_bg_tilemap_pending_mask==5); // SBB28 cannot hold a 16 KiB map
 assert(gbs_hw_set_affine_map_screen_base(0));
 gbs_hw_set_display_mode(1);
 gbs_hw_set_render_handoff_fallback();
 assert((fake_dispcnt & 7) == 0);
 gbs_hw_wait_vblank();
 assert((fake_dispcnt & 7) == 1); // a second UI publication must restore the authored video mode
 gbs_hw_set_backdrop(0x2468);gbs_hw_set_render_handoff_fallback();gbs_hw_wait_vblank();
 assert(fake_palette[0]==0x2468);
 const uint16_t new_palette[]={0x3456};
 gbs_hw_set_render_handoff_fallback();gbs_hw_load_bg_palette(new_palette,0,1);gbs_hw_wait_vblank();
 assert(fake_palette[0]==0x3456); // a staged image palette supersedes the previous scene color


}
'''
fixture=fixture.replace('#include <cstring>','#include <cstring>\n#include <initializer_list>')
with tempfile.TemporaryDirectory() as temp:
 cpp=Path(temp)/'test.cpp';cpp.write_text(fixture);exe=Path(temp)/'test'
 subprocess.run(['c++','-std=c++17','-Wall','-Wextra','-Werror',str(cpp),'-o',str(exe)],check=True)
 subprocess.run([str(exe)],check=True)
print('Affine map and transparent UI publication remain isolated: PASS')
