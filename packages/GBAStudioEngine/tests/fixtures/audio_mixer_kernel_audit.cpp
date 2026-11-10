// Standalone ROM regression for the ARM kernel, including alignment and tails.
// The implementation is included only in this diagnostic translation unit so
// its internal buffers can be inspected; no test entry point ships in the SDK.
#include "../../engine/src/gbs_audio.cpp"

volatile uint32_t audio_kernel_witness[4] __attribute__((section(".ewram_bss"))) = {};
extern "C" int gbs_main() {
    audio_kernel_witness[0] = 0x4d495845; audio_kernel_witness[1] = 0x4b45524e;
    alignas(4) int8_t source[536];
    for (int i = 0; i < 536; ++i) source[i] = static_cast<int8_t>((i * 37) & 255);
    const size_t counts[] = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 127, 128, 129, 527, 528 };
    uint32_t cases = 0;
    for (int unity = 0; unity <= 1; ++unity) {
    for (int n = -128; n < 128; ++n) {
        const int left = unity ? n : n * 9 / 15, right = unity ? n : n * 7 / 15;
        pcm_stereo_gain[n + 128] = static_cast<uint16_t>(left) |
            (static_cast<uint32_t>(static_cast<uint16_t>(right - (left < 0))) << 16);
    }
    for (size_t alignment = 0; alignment < 4; ++alignment) for (size_t count : counts) {
        for (size_t i = 0; i < 528; ++i) pcm_mix_accumulator[i] = pcm_stereo_bias + i;
        mix_pcm_native_run(source + alignment, pcm_mix_accumulator, count, unity);
        for (size_t i = 0; i < 528; ++i) {
            const uint32_t expected = pcm_stereo_bias + i + (i < count ? pcm_stereo_gain[source[i + alignment] + 128] : 0);
            if (pcm_mix_accumulator[i] != expected) { audio_kernel_witness[2] = 0xdead; audio_kernel_witness[3] = cases; for (;;) {} }
        }
        ++cases;
    }
    }
    audio_kernel_witness[3] = cases;
    audio_kernel_witness[2] = 1;
    for (;;) {}
}
