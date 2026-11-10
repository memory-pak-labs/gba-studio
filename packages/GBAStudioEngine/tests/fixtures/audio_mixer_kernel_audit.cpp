// Standalone ROM regression for the ARM kernel, including alignment and tails.
// The implementation is included only in this diagnostic translation unit so
// its internal buffers can be inspected; no test entry point ships in the SDK.
#include "../../engine/src/gbs_audio.cpp"

volatile uint32_t audio_kernel_witness[4] __attribute__((section(".ewram_bss"))) = {};
extern "C" __attribute__((target("arm"))) int gbs_main() {
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
    // Exact constant accumulation, including untouched tails and negative lanes.
    const uint32_t gains[] = { 0, 1, 0xffffffffu, 0xfffdfffdu, 0x00020003u, 0xfffe0001u };
    for (uint32_t gain : gains) for (size_t count : counts) {
        for (size_t i = 0; i < 528; ++i) pcm_mix_accumulator[i] = pcm_stereo_bias + i;
        mix_pcm_constant_run(pcm_mix_accumulator, count, gain);
        for (size_t i = 0; i < 528; ++i) if (pcm_mix_accumulator[i] != pcm_stereo_bias + i + (i < count ? gain : 0)) {
            audio_kernel_witness[2] = 0xdead; audio_kernel_witness[3] = cases; for (;;) {}
        }
        ++cases;
    }
    // Packed publication equals the scalar limiter, with both signs and sides.
    for (int limited = 0; limited <= 1; ++limited) for (int mono = 0; mono <= 1; ++mono) {
        pcm_mix_peak_bound = limited ? 1024 : 96;
        for (size_t i = 0; i < 528; ++i) {
            const int left = limited ? static_cast<int>(i) - 264 : static_cast<int>(i % 193) - 96;
            const int right = -left;
            pcm_mix_accumulator[i] = pcm_stereo_bias + static_cast<uint32_t>(right * 65536 + left);
        }
        auto* left = pcm_mix_buffers[0][0]; auto* right = pcm_mix_buffers[0][1];
        write_pcm_mix_stereo(left, right, mono);
        for (size_t i = 0; i < 528; ++i) {
            const int l = limited ? static_cast<int>(i) - 264 : static_cast<int>(i % 193) - 96;
            if (left[i] != encode_pcm_fifo_sample(clamp_pcm_sample(l)) || right[i] != encode_pcm_fifo_sample(clamp_pcm_sample(mono ? l : -l))) {
                audio_kernel_witness[2] = 0xdead; audio_kernel_witness[3] = cases; for (;;) {}
            }
        }
        ++cases;
    }
    // Walk prepared Q16 boundaries and the loop seam against the scalar ARM
    // resampler across changing rates. Every stereo accumulator word must match.
    const int8_t tiny[] = { -1, 1 };
    const gbs::PcmAsset asset { tiny, 2, 8363, true };
    const gbs::PcmInterpolationInterval intervals[] = {
        { 32768, 0xfffeffffu }, { 65536, 0 }, { 65537, 0x00010001u },
        { 98305, 0 }, { 131072, 0xfffeffffu }
    };
    const gbs::PcmInterpolationMap map { 0, intervals, 5, 0 };
    static uint32_t expected[528] __attribute__((section(".ewram_bss")));
    PcmPlayback scalar {}, prepared {}; scalar.asset = prepared.asset = &asset;
    for (int n = -128; n < 128; ++n) pcm_stereo_gain[n + 128] = static_cast<uint32_t>(n * 65537);
    for (int frame = 0; frame < 40; ++frame) {
        const uint32_t rate = 4000 + (frame * 1733) % 60000;
        scalar.step_fp = prepared.step_fp = static_cast<uint32_t>((static_cast<uint64_t>(rate) << 16) / 31536);
        scalar.step_reciprocal = prepared.step_reciprocal = 0xffffffffu / scalar.step_fp;
        clear_pcm_accumulator(); mix_pcm_voice_samples(scalar, nullptr, false);
        for (size_t i = 0; i < 528; ++i) expected[i] = pcm_mix_accumulator[i];
        clear_pcm_accumulator(); mix_pcm_prepared_block(prepared, map);
        for (size_t i = 0; i < 528; ++i) if (pcm_mix_accumulator[i] != expected[i] || scalar.position_fp != prepared.position_fp) {
            audio_kernel_witness[2] = 0xdead; audio_kernel_witness[3] = cases; for (;;) {}
        }
        ++cases;
    }
    audio_kernel_witness[3] = cases;
    audio_kernel_witness[2] = 1;
    for (;;) {}
}
