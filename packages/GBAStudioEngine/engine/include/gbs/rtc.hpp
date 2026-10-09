#pragma once

#include <stdint.h>

namespace gbs {

struct RtcDateTime {
    uint16_t year;
    uint8_t month;
    uint8_t day;
    uint8_t weekday;
    uint8_t hour;
    uint8_t minute;
    uint8_t second;
};

enum class RtcField : uint8_t {
    Year = 0,
    Month = 1,
    Day = 2,
    Weekday = 3,
    Hour = 4,
    Minute = 5,
    Second = 6
};

constexpr bool is_valid_rtc_field(RtcField field) {
    return static_cast<uint8_t>(field) <= static_cast<uint8_t>(RtcField::Second);
}

constexpr bool rtc_field_value(const RtcDateTime& date_time, RtcField field, int& out) {
    switch (field) {
    case RtcField::Year:
        out = date_time.year;
        return true;
    case RtcField::Month:
        out = date_time.month;
        return true;
    case RtcField::Day:
        out = date_time.day;
        return true;
    case RtcField::Weekday:
        out = date_time.weekday;
        return true;
    case RtcField::Hour:
        out = date_time.hour;
        return true;
    case RtcField::Minute:
        out = date_time.minute;
        return true;
    case RtcField::Second:
        out = date_time.second;
        return true;
    default:
        out = 0;
        return false;
    }
}

using RtcReadDateTime = bool (*)(void* user_data, RtcDateTime& out);
using RtcWriteDateTime = bool (*)(void* user_data, const RtcDateTime& value);
using RtcReset = bool (*)(void* user_data);

struct RtcProvider {
    RtcReadDateTime read = nullptr;
    void* user_data = nullptr;
    RtcWriteDateTime write = nullptr;
    RtcReset reset = nullptr;
};

constexpr bool is_leap_year(uint16_t year) {
    return (year % 4u) == 0u && ((year % 100u) != 0u || (year % 400u) == 0u);
}

constexpr uint8_t days_in_rtc_month(uint16_t year, uint8_t month) {
    switch (month) {
    case 2:
        return is_leap_year(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
        return 30;
    default:
        return 31;
    }
}

constexpr bool is_valid_rtc_datetime(const RtcDateTime& value) {
    return value.year >= 2000 && value.year <= 2099 &&
           value.month >= 1 && value.month <= 12 &&
           value.day >= 1 && value.day <= days_in_rtc_month(value.year, value.month) &&
           value.weekday <= 6 &&
           value.hour <= 23 && value.minute <= 59 && value.second <= 59;
}

bool rtc_read_datetime(const RtcProvider& provider, RtcDateTime& out);
bool rtc_write_datetime(const RtcProvider& provider, const RtcDateTime& value);
bool rtc_reset(const RtcProvider& provider);
constexpr uint8_t rtc_encode_bcd(uint8_t value) {
    return static_cast<uint8_t>(((value / 10u) << 4u) | (value % 10u));
}
constexpr uint8_t rtc_decode_bcd(uint8_t value) {
    return static_cast<uint8_t>(((value >> 4u) * 10u) + (value & 0x0Fu));
}
bool rtc_gba_read_datetime(RtcDateTime& out);
bool rtc_gba_write_datetime(const RtcDateTime& value);
bool rtc_gba_reset();
bool rtc_gba_present();
RtcProvider gba_rtc_provider();

} // namespace gbs
