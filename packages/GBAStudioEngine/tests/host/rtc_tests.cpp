#include <cassert>

#include "gbs/rtc.hpp"

namespace {

bool read_fixed_datetime(void*, gbs::RtcDateTime& out) {
    out = gbs::RtcDateTime { 2026, 9, 1, 2, 2, 34, 56 };
    return true;
}

bool read_invalid_datetime(void*, gbs::RtcDateTime& out) {
    out = gbs::RtcDateTime { 2026, 2, 29, 0, 25, 60, 60 };
    return true;
}

gbs::RtcDateTime last_written {};
bool reset_called = false;

bool write_datetime(void*, const gbs::RtcDateTime& value) {
    last_written = value;
    return true;
}

bool reset_rtc(void*) {
    reset_called = true;
    return true;
}

void test_provider_reads_and_validates_datetime() {
    const gbs::RtcProvider provider { read_fixed_datetime, nullptr };
    gbs::RtcDateTime value {};
    assert(gbs::rtc_read_datetime(provider, value));
    assert(value.year == 2026);
    assert(value.month == 9);
    assert(value.day == 1);
    assert(value.hour == 2);
    assert(value.minute == 34);
    assert(value.second == 56);
}

void test_provider_rejects_missing_or_invalid_data() {
    gbs::RtcDateTime value { 2001, 1, 1, 0, 0, 0, 0 };
    assert(!gbs::rtc_read_datetime(gbs::RtcProvider {}, value));
    assert(value.year == 2001);

    const gbs::RtcProvider invalid { read_invalid_datetime, nullptr };
    assert(!gbs::rtc_read_datetime(invalid, value));
    assert(value.year == 2001);
}

void test_rtc_datetime_validation_handles_calendar_boundaries() {
    assert(gbs::is_valid_rtc_datetime(gbs::RtcDateTime { 2024, 2, 29, 4, 23, 59, 59 }));
    assert(!gbs::is_valid_rtc_datetime(gbs::RtcDateTime { 2023, 2, 29, 3, 23, 59, 59 }));
    assert(!gbs::is_valid_rtc_datetime(gbs::RtcDateTime { 2024, 13, 1, 1, 0, 0, 0 }));
    assert(!gbs::is_valid_rtc_datetime(gbs::RtcDateTime { 2024, 1, 1, 7, 0, 0, 0 }));
}

void test_host_hardware_provider_fails_without_gba_gpio() {
    gbs::RtcDateTime value { 2001, 1, 1, 0, 0, 0, 0 };
    assert(!gbs::rtc_gba_read_datetime(value));
    assert(value.year == 2001);
}

void test_provider_writes_valid_datetime_and_rejects_invalid_datetime() {
    const gbs::RtcProvider provider { read_fixed_datetime, nullptr, write_datetime, reset_rtc };
    const gbs::RtcDateTime valid { 2026, 12, 31, 4, 23, 59, 58 };
    assert(gbs::rtc_write_datetime(provider, valid));
    assert(last_written.year == 2026 && last_written.minute == 59);
    assert(!gbs::rtc_write_datetime(provider, gbs::RtcDateTime { 2026, 2, 30, 1, 0, 0, 0 }));
    assert(gbs::rtc_reset(provider));
    assert(reset_called);
}

void test_bcd_serialization_is_decimal_to_packed_bcd() {
    assert(gbs::rtc_encode_bcd(0) == 0x00);
    assert(gbs::rtc_encode_bcd(9) == 0x09);
    assert(gbs::rtc_encode_bcd(23) == 0x23);
    assert(gbs::rtc_encode_bcd(59) == 0x59);
    assert(gbs::rtc_decode_bcd(0x59) == 59);
}

} // namespace

int main() {
    test_provider_reads_and_validates_datetime();
    test_provider_rejects_missing_or_invalid_data();
    test_rtc_datetime_validation_handles_calendar_boundaries();
    test_host_hardware_provider_fails_without_gba_gpio();
    test_provider_writes_valid_datetime_and_rejects_invalid_datetime();
    test_bcd_serialization_is_decimal_to_packed_bcd();
    return 0;
}
