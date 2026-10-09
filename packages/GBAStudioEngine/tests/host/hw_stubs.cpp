#include <stdint.h>

extern "C" {

void gbs_hw_sio_close(void) {}
void gbs_hw_sio_normal8_init(int) {}
int gbs_hw_sio_normal8_transfer(uint8_t, int, uint32_t, uint8_t*) { return 0; }
int gbs_hw_sio_normal32_transfer(uint32_t, int, uint32_t, uint32_t*) { return 0; }
int gbs_hw_sio_multiplayer_init(void) { return 1; }
int gbs_hw_sio_multiplayer_transfer(uint16_t outgoing, uint32_t, uint16_t received[4],
                                    uint8_t* player_id, uint8_t* connected_mask) {
    if (received) for (int index = 0; index < 4; ++index) received[index] = outgoing;
    if (player_id) *player_id = 0;
    if (connected_mask) *connected_mask = 0x0Fu;
    return 1;
}
void gbs_hw_gpio_write(int, int) {}
int gbs_hw_gpio_read(int) { return 0; }
int gbs_hw_get_vcount(void) { return 0; }

} // extern "C"

extern "C" void __attribute__((weak)) gbs_hw_start_hblank_affine(int,const uint32_t*) {}
extern "C" uint32_t* __attribute__((weak)) gbs_hw_hblank_affine_buffer() { static uint32_t words[644];return words; }
