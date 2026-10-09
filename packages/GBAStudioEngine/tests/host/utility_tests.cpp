#include <cassert>
#include <stdint.h>
#include "gbs/format.hpp"
#include "gbs/info.hpp"
#include "gbs/random.hpp"
#include "gbs/save.hpp"

namespace {

void test_random_is_seeded_nonzero_and_bounded() {
    gbs::RandomState first {};
    gbs::RandomState second {};
    gbs::seed_random(first, 0);
    gbs::seed_random(second, 7);
    assert(first.state == 1);
    const uint32_t first_value = gbs::next_random(first);
    const uint32_t second_value = gbs::next_random(first);
    assert(first_value != second_value);
    for (int index = 0; index < 32; ++index) {
        const uint32_t value = gbs::random_bounded(second, 6);
        assert(value < 6);
    }
    assert(gbs::random_bounded(second, 0) == 0);
    assert(gbs::random_range(second, 8, 3) >= 3);
    assert(gbs::random_range(second, 8, 3) <= 8);
}

void test_formatters_are_bounded_and_report_required_size() {
    char buffer[16] = {};
    gbs::FormatResult result = gbs::format_uint32(4294967295u, buffer, sizeof(buffer));
    assert(result.complete);
    assert(result.required_size == 10);
    assert(buffer[0] == '4' && buffer[9] == '5' && buffer[10] == '\0');

    result = gbs::format_int32(-2147483647 - 1, buffer, sizeof(buffer));
    assert(result.complete);
    assert(result.required_size == 11);
    assert(buffer[0] == '-' && buffer[10] == '8');

    char tiny[4] = { 'x', 'x', 'x', 'x' };
    result = gbs::format_uint32(12345, tiny, sizeof(tiny));
    assert(!result.complete);
    assert(result.required_size == 5);
    assert(tiny[3] == '\0');
    assert(gbs::format_int32(4, nullptr, 0).required_size == 1);
}

void test_hardware_info_is_explicit_about_detection_boundary() {
    const gbs::HardwareInfo info = gbs::hardware_info();
    assert(info.model == gbs::HardwareModel::GbaAgb);
    assert(info.cpu_frequency_hz == 16777216u);
    assert(info.screen_width == 240);
    assert(info.screen_height == 160);
    assert(!info.cartridge_save_probe_available);
    assert(gbs::detected_cartridge_save_device() == gbs::CartridgeSaveDevice::Unknown);
    assert(gbs::configured_cartridge_save_device() == gbs::CartridgeSaveDevice::Sram32K);
    const gbs::CartridgeSaveCapabilities sram = gbs::configured_cartridge_save_capabilities();
    assert(sram.capacity_bytes == gbs::save_sram_size);
    assert(sram.write_granularity_bytes == 1);
    assert(sram.runtime_backend_available);
    assert(!sram.runtime_probe_safe);
    const gbs::CartridgeSaveCapabilities flash = gbs::cartridge_save_capabilities(gbs::CartridgeSaveDevice::Flash);
    assert(flash.capacity_bytes == 32u * 1024u);
    assert(flash.runtime_backend_available);
}

} // namespace

int main() {
    test_random_is_seeded_nonzero_and_bounded();
    test_formatters_are_bounded_and_report_required_size();
    test_hardware_info_is_explicit_about_detection_boundary();
    return 0;
}
