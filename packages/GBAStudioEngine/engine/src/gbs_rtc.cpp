#include "gbs/rtc.hpp"

namespace {

[[maybe_unused]] bool is_bcd_byte(uint8_t value) {
    return (value & 0x0Fu) <= 9u && ((value >> 4u) & 0x0Fu) <= 9u;
}

#if defined(__arm__) || defined(__thumb__)

constexpr uintptr_t gba_gpio_data_address = 0x080000C4u;
constexpr uintptr_t gba_gpio_direction_address = 0x080000C6u;
constexpr uintptr_t gba_gpio_control_address = 0x080000C8u;

constexpr uint16_t gpio_sck = 1u << 0u;
constexpr uint16_t gpio_sio = 1u << 1u;
constexpr uint16_t gpio_cs = 1u << 2u;
constexpr uint16_t gpio_outputs = gpio_sck | gpio_sio | gpio_cs;
constexpr uint16_t gpio_read_direction = gpio_sck | gpio_cs;

volatile uint16_t& gba_gpio_data() {
    return *reinterpret_cast<volatile uint16_t*>(gba_gpio_data_address);
}

volatile uint16_t& gba_gpio_direction() {
    return *reinterpret_cast<volatile uint16_t*>(gba_gpio_direction_address);
}

volatile uint16_t& gba_gpio_control() {
    return *reinterpret_cast<volatile uint16_t*>(gba_gpio_control_address);
}

void write_gpio(uint16_t value) {
    gba_gpio_data() = value;
}

void begin_rtc_transaction() {
    gba_gpio_control() = 1;
    gba_gpio_direction() = gpio_outputs;
    write_gpio(gpio_sck);
    write_gpio(static_cast<uint16_t>(gpio_sck | gpio_cs));
}

void end_rtc_transaction() {
    write_gpio(gpio_sck);
    gba_gpio_direction() = gpio_outputs;
    gba_gpio_control() = 0;
}

void write_rtc_bit(bool value) {
    const uint16_t data = static_cast<uint16_t>(gpio_cs | (value ? gpio_sio : 0));
    write_gpio(data);
    write_gpio(static_cast<uint16_t>(data | gpio_sck));
}

void write_rtc_command(uint8_t command) {
    for (uint8_t bit = 0; bit < 8; ++bit) {
        write_rtc_bit((command & (1u << bit)) != 0);
    }
}

uint8_t read_rtc_byte() {
    uint8_t value = 0;
    gba_gpio_direction() = gpio_read_direction;
    for (uint8_t bit = 0; bit < 8; ++bit) {
        write_gpio(gpio_cs);
        write_gpio(static_cast<uint16_t>(gpio_cs | gpio_sck));
        if ((gba_gpio_data() & gpio_sio) != 0) {
            value = static_cast<uint8_t>(value | (1u << bit));
        }
    }
    return value;
}

void write_rtc_byte(uint8_t value) {
    gba_gpio_direction() = gpio_outputs;
    for (uint8_t bit = 0; bit < 8; ++bit) {
        write_rtc_bit((value >> bit) & 1u);
    }
}

bool write_gba_rtc_register(uint8_t command, const uint8_t* data, uint8_t count) {
    if (data == nullptr || count == 0) return false;
    begin_rtc_transaction();
    write_rtc_command(command);
    gba_gpio_direction() = gpio_outputs;
    for (uint8_t index = 0; index < count; ++index) {
        write_rtc_byte(data[index]);
    }
    end_rtc_transaction();
    return true;
}

bool read_gba_rtc_register(uint8_t command, uint8_t* output, uint8_t count) {
    if (output == nullptr || count == 0) return false;
    begin_rtc_transaction();
    write_rtc_command(command);
    gba_gpio_direction() = gpio_read_direction;
    for (uint8_t index = 0; index < count; ++index) {
        output[index] = read_rtc_byte();
    }
    end_rtc_transaction();
    return true;
}

#endif

} // namespace

namespace gbs {

bool rtc_read_datetime(const RtcProvider& provider, RtcDateTime& out) {
    if (provider.read == nullptr) return false;
    RtcDateTime value = out;
    if (!provider.read(provider.user_data, value) || !is_valid_rtc_datetime(value)) {
        return false;
    }
    out = value;
    return true;
}

bool rtc_write_datetime(const RtcProvider& provider, const RtcDateTime& value) {
    return provider.write != nullptr && is_valid_rtc_datetime(value) &&
        provider.write(provider.user_data, value);
}

bool rtc_reset(const RtcProvider& provider) {
    return provider.reset != nullptr && provider.reset(provider.user_data);
}

bool rtc_gba_present() {
#if defined(__arm__) || defined(__thumb__)
    uint8_t status = 0;
    return read_gba_rtc_register(0x63, &status, 1) && (status & 0x40u) != 0;
#else
    return false;
#endif
}

bool rtc_gba_read_datetime(RtcDateTime& out) {
#if defined(__arm__) || defined(__thumb__)
    // The S-3511 status register must advertise 24-hour mode. This also
    // rejects most cartridges that do not expose an RTC on their GPIO bus.
    uint8_t status = 0;
    if (!read_gba_rtc_register(0x63, &status, 1) || (status & 0x40u) == 0) {
        return false;
    }

    uint8_t raw[7] = {};
    if (!read_gba_rtc_register(0x65, raw, 7)) {
        return false;
    }
    for (uint8_t value : raw) {
        if (!is_bcd_byte(value)) return false;
    }

    RtcDateTime decoded {
        static_cast<uint16_t>(2000u + rtc_decode_bcd(raw[0])),
        rtc_decode_bcd(raw[1]), rtc_decode_bcd(raw[2]), rtc_decode_bcd(raw[3]),
        rtc_decode_bcd(raw[4]), rtc_decode_bcd(raw[5]), rtc_decode_bcd(raw[6])
    };
    if (!is_valid_rtc_datetime(decoded)) return false;
    out = decoded;
    return true;
#else
    (void)out;
    return false;
#endif
}

bool rtc_gba_write_datetime(const RtcDateTime& in) {
#if defined(__arm__) || defined(__thumb__)
    if (!is_valid_rtc_datetime(in) || !rtc_gba_present()) return false;
    // Write the datetime to the S-3511 RTC.
    // The write command 0x6D writes 7 bytes of datetime data starting at register 0x65.
    uint8_t raw[7] = {
        rtc_encode_bcd(static_cast<uint8_t>(in.year - 2000u)),
        rtc_encode_bcd(in.month), rtc_encode_bcd(in.day), rtc_encode_bcd(in.weekday),
        rtc_encode_bcd(in.hour), rtc_encode_bcd(in.minute), rtc_encode_bcd(in.second)
    };
    return write_gba_rtc_register(0x6d, raw, 7);
#else
    (void)in;
    return false;
#endif
}

bool rtc_gba_reset() {
#if defined(__arm__) || defined(__thumb__)
    if (!rtc_gba_present()) return false;
    begin_rtc_transaction();
    write_rtc_command(0x60);
    end_rtc_transaction();
    return true;
#else
    return false;
#endif
}

bool rtc_gba_read_write_datetime(RtcDateTime& out, bool write_first) {
#if defined(__arm__) || defined(__thumb__)
    // Try reading first; if the RTC is present and responding, optionally write.
    if (!rtc_gba_read_datetime(out)) return false;
    if (write_first) {
        if (!rtc_gba_write_datetime(out)) return false;
    }
    return true;
#else
    (void)out;
    (void)write_first;
    return false;
#endif
}

RtcProvider gba_rtc_provider() {
    return RtcProvider {
        [](void*, RtcDateTime& out) { return rtc_gba_read_datetime(out); }, nullptr,
        [](void*, const RtcDateTime& value) { return rtc_gba_write_datetime(value); },
        [](void*) { return rtc_gba_reset(); }
    };
}

} // namespace gbs
