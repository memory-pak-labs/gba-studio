#include "gbs/save.hpp"
#include "gbs/dialogue.hpp"

namespace {

constexpr uint32_t erased_byte = 0xFFu;
constexpr uint32_t save_record_magic = 0x4D534247u; // "GBSM" little-endian.
constexpr uint16_t save_record_version = 1u;

#if defined(__arm__) || defined(__thumb__)
volatile uint8_t* save_memory_base() {
    return reinterpret_cast<volatile uint8_t*>(0x0E000000);
}
#else
uint8_t host_save_memory[gbs::save_sram_size] = {};
bool host_save_initialized = false;

void ensure_host_save_initialized() {
    if (host_save_initialized) {
        return;
    }
    for (uint32_t index = 0; index < gbs::save_sram_size; ++index) {
        host_save_memory[index] = static_cast<uint8_t>(erased_byte);
    }
    host_save_initialized = true;
}

volatile uint8_t* save_memory_base() {
    ensure_host_save_initialized();
    return host_save_memory;
}
#endif

uint8_t default_read_byte(void*, uint32_t offset) {
    return save_memory_base()[offset];
}

bool default_write_byte(void*, uint32_t offset, uint8_t value) {
    save_memory_base()[offset] = value;
    return true;
}

bool default_erase(void*, uint32_t offset, uint32_t size) {
    for (uint32_t index = 0; index < size; ++index) {
        save_memory_base()[offset + index] = static_cast<uint8_t>(erased_byte);
    }
    return true;
}

uint8_t hardware_flash_read(void*, uint32_t address) {
    return save_memory_base()[address];
}

void hardware_flash_write(void*, uint32_t address, uint8_t value) {
    save_memory_base()[address] = value;
}

gbs::Flash1MBus hardware_flash_bus { nullptr, hardware_flash_read, hardware_flash_write };

void select_flash1m_bank(gbs::Flash1MBus* bus, uint8_t bank) {
    bus->write(bus->user_data, 0x5555u, 0xAAu);
    bus->write(bus->user_data, 0x2AAAu, 0x55u);
    bus->write(bus->user_data, 0x5555u, 0xB0u);
    bus->write(bus->user_data, 0, bank);
}

void reset_flash1m(gbs::Flash1MBus* bus) {
    bus->write(bus->user_data, 0x5555u, 0xAAu);
    bus->write(bus->user_data, 0x2AAAu, 0x55u);
    bus->write(bus->user_data, 0x5555u, 0xF0u);
}

bool probe_flash1m(gbs::Flash1MBus* bus) {
    if (bus == nullptr || bus->read == nullptr || bus->write == nullptr) return false;
#if defined(__arm__) || defined(__thumb__)
    if (bus == &hardware_flash_bus) {
        volatile uint16_t* waitcnt = reinterpret_cast<volatile uint16_t*>(0x04000204);
        *waitcnt = static_cast<uint16_t>((*waitcnt & ~3u) | 3u); // 8-cycle save-memory access.
    }
#endif
    // mGBA starts in Flash512 mode and detects Flash1M when bank 1 is selected.
    // Return to bank 0 before probing or accessing the first 32 KiB.
    select_flash1m_bank(bus, 1);
    select_flash1m_bank(bus, 0);
    bus->write(bus->user_data, 0x5555u, 0xAAu);
    bus->write(bus->user_data, 0x2AAAu, 0x55u);
    bus->write(bus->user_data, 0x5555u, 0x90u);
    const uint8_t manufacturer = bus->read(bus->user_data, 0);
    const uint8_t device = bus->read(bus->user_data, 1);
    reset_flash1m(bus);
    return (manufacturer == 0xC2u && device == 0x09u) ||
        (manufacturer == 0x62u && device == 0x13u);
}

uint8_t flash1m_read_byte(void* user_data, uint32_t offset) {
    auto* bus = static_cast<gbs::Flash1MBus*>(user_data);
    return bus->read(bus->user_data, offset);
}

bool flash1m_write_byte(void* user_data, uint32_t offset, uint8_t value) {
    auto* bus = static_cast<gbs::Flash1MBus*>(user_data);
    if (offset >= gbs::save_sram_size) return false;
    if (value == 0xFFu) return bus->read(bus->user_data, offset) == value;
    const gbs::FlashCommandSequence commands = gbs::make_flash_program_sequence(offset, value);
    for (uint8_t index = 0; index < commands.command_count; ++index) {
        bus->write(bus->user_data, commands.commands[index].address, commands.commands[index].value);
    }
    for (uint32_t attempt = 0; attempt < 100000u; ++attempt) {
        if (bus->read(bus->user_data, offset) == value) return true;
    }
    reset_flash1m(bus);
    return false;
}

bool flash1m_erase(void* user_data, uint32_t offset, uint32_t size) {
    auto* bus = static_cast<gbs::Flash1MBus*>(user_data);
    if (size == 0 || offset % gbs::flash1m_sector_size != 0 ||
        size % gbs::flash1m_sector_size != 0 ||
        offset > gbs::save_sram_size || size > gbs::save_sram_size - offset) return false;
    for (uint32_t sector = offset; sector < offset + size; sector += gbs::flash1m_sector_size) {
        uint32_t poll_address = sector + gbs::flash1m_sector_size;
        for (uint32_t index = 0; index < gbs::flash1m_sector_size; ++index) {
            if (bus->read(bus->user_data, sector + index) != 0xFFu) {
                poll_address = sector + index;
                break;
            }
        }
        if (poll_address == sector + gbs::flash1m_sector_size) continue;
        const gbs::FlashCommandSequence commands = gbs::make_flash_sector_erase_sequence(sector);
        for (uint8_t index = 0; index < commands.command_count; ++index) {
            bus->write(bus->user_data, commands.commands[index].address, commands.commands[index].value);
        }
        bool complete = false;
        for (uint32_t attempt = 0; attempt < 2000000u; ++attempt) {
            if (bus->read(bus->user_data, poll_address) == 0xFFu) {
                complete = true;
                break;
            }
        }
        if (!complete) {
            reset_flash1m(bus);
            return false;
        }
        for (uint32_t index = 0; index < gbs::flash1m_sector_size; ++index) {
            if (bus->read(bus->user_data, sector + index) != 0xFFu) return false;
        }
    }
    return true;
}

gbs::SaveBackend default_save_backend() {
    if (gbs::configured_cartridge_save_device() == gbs::CartridgeSaveDevice::Flash) {
        return gbs::make_flash1m_backend(&hardware_flash_bus);
    }
    return gbs::SaveBackend {
        gbs::CartridgeSaveDevice::Sram32K,
        gbs::save_sram_size,
        1,
        0,
        nullptr,
        default_read_byte,
        default_write_byte,
        default_erase
    };
}

gbs::SaveBackend active_backend = default_save_backend();

bool valid_backend(const gbs::SaveBackend& backend) {
    return backend.device != gbs::CartridgeSaveDevice::Unknown &&
        backend.capacity_bytes > gbs::save_header_size &&
        backend.write_granularity_bytes > 0 &&
        backend.read_byte != nullptr &&
        backend.write_byte != nullptr &&
        (backend.erase_granularity_bytes == 0 || backend.erase != nullptr);
}

uint32_t active_backend_capacity() {
    return active_backend.capacity_bytes;
}

bool valid_active_slot(gbs::SaveSlot slot) {
    if (!gbs::is_valid_save_slot_for_capacity(slot, active_backend_capacity())) return false;
    return active_backend.read_byte != flash1m_read_byte ||
        (slot.offset % gbs::flash1m_sector_size == 0 &&
         slot.capacity % gbs::flash1m_sector_size == 0);
}

bool valid_active_bank(gbs::SaveBank bank) {
    if (!gbs::is_valid_save_bank_for_capacity(bank, active_backend_capacity())) return false;
    return active_backend.read_byte != flash1m_read_byte ||
        (bank.offset % gbs::flash1m_sector_size == 0 &&
         bank.slot_capacity % gbs::flash1m_sector_size == 0);
}

uint8_t read_save_byte(uint32_t offset) {
    return active_backend.read_byte(active_backend.user_data, offset);
}

bool write_save_byte(uint32_t offset, uint8_t value) {
    return active_backend.write_byte(active_backend.user_data, offset, value);
}

uint16_t read_u16(uint32_t offset) {
    return static_cast<uint16_t>(read_save_byte(offset)) |
        static_cast<uint16_t>(read_save_byte(offset + 1) << 8);
}

uint32_t read_u32(uint32_t offset) {
    return static_cast<uint32_t>(read_save_byte(offset)) |
        (static_cast<uint32_t>(read_save_byte(offset + 1)) << 8) |
        (static_cast<uint32_t>(read_save_byte(offset + 2)) << 16) |
        (static_cast<uint32_t>(read_save_byte(offset + 3)) << 24);
}

bool write_u16(uint32_t offset, uint16_t value) {
    return write_save_byte(offset, static_cast<uint8_t>(value & 0xFFu)) &&
        write_save_byte(offset + 1, static_cast<uint8_t>((value >> 8) & 0xFFu));
}

bool write_u32(uint32_t offset, uint32_t value) {
    return write_save_byte(offset, static_cast<uint8_t>(value & 0xFFu)) &&
        write_save_byte(offset + 1, static_cast<uint8_t>((value >> 8) & 0xFFu)) &&
        write_save_byte(offset + 2, static_cast<uint8_t>((value >> 16) & 0xFFu)) &&
        write_save_byte(offset + 3, static_cast<uint8_t>((value >> 24) & 0xFFu));
}

uint16_t read_u16_from(const uint8_t* data) {
    return static_cast<uint16_t>(data[0]) |
        static_cast<uint16_t>(data[1] << 8);
}

uint32_t read_u32_from(const uint8_t* data) {
    return static_cast<uint32_t>(data[0]) |
        (static_cast<uint32_t>(data[1]) << 8) |
        (static_cast<uint32_t>(data[2]) << 16) |
        (static_cast<uint32_t>(data[3]) << 24);
}

void write_u16_to(uint8_t* data, uint16_t value) {
    data[0] = static_cast<uint8_t>(value & 0xFFu);
    data[1] = static_cast<uint8_t>((value >> 8) & 0xFFu);
}

void write_u32_to(uint8_t* data, uint32_t value) {
    data[0] = static_cast<uint8_t>(value & 0xFFu);
    data[1] = static_cast<uint8_t>((value >> 8) & 0xFFu);
    data[2] = static_cast<uint8_t>((value >> 16) & 0xFFu);
    data[3] = static_cast<uint8_t>((value >> 24) & 0xFFu);
}

uint32_t payload_offset(gbs::SaveSlot slot) {
    return slot.offset + gbs::save_header_size;
}

uint32_t payload_capacity(gbs::SaveSlot slot) {
    return slot.capacity - gbs::save_header_size;
}

bool looks_erased(gbs::SaveSlot slot) {
    for (uint32_t index = 0; index < gbs::save_header_size; ++index) {
        if (read_save_byte(slot.offset + index) != erased_byte) {
            return false;
        }
    }
    return true;
}

void append_eeprom_bit(gbs::EepromSerialFrame& frame, uint8_t bit) {
    if (frame.bit_count < gbs::eeprom_serial_frame_capacity_bits) {
        frame.bits[frame.bit_count++] = static_cast<uint8_t>(bit != 0);
    }
}

bool valid_eeprom_address(uint16_t address, uint8_t address_bits) {
    if (address_bits != 6 && address_bits != 14) {
        return false;
    }
    const uint16_t limit = static_cast<uint16_t>(1u << address_bits);
    return address < limit;
}

} // namespace

namespace gbs {

SaveBackend make_flash1m_backend(Flash1MBus* bus) {
    return SaveBackend { CartridgeSaveDevice::Flash, save_sram_size, 1,
        static_cast<uint16_t>(flash1m_sector_size), bus,
        flash1m_read_byte, flash1m_write_byte, flash1m_erase };
}

bool configure_save_backend(const SaveBackend& backend) {
    if (!valid_backend(backend)) {
        return false;
    }
    active_backend = backend;
    return true;
}

void reset_save_backend() {
    active_backend = default_save_backend();
}

SaveBackend active_save_backend() {
    return active_backend;
}

namespace {

bool erase_backend_range(uint32_t offset, uint32_t size) {
    if (active_backend.erase != nullptr) {
        return active_backend.erase(active_backend.user_data, offset, size);
    }
    for (uint32_t index = 0; index < size; ++index) {
        if (!write_save_byte(offset + index, static_cast<uint8_t>(erased_byte))) {
            return false;
        }
    }
    return true;
}

bool write_bytes(uint32_t offset, const uint8_t* data, size_t size) {
    if (data == nullptr && size > 0) {
        return false;
    }
    for (size_t index = 0; index < size; ++index) {
        if (!write_save_byte(offset + static_cast<uint32_t>(index), data[index])) {
            return false;
        }
    }
    return true;
}

}

uint32_t save_checksum(const uint8_t* data, size_t size) {
    if (data == nullptr && size > 0) {
        return 0;
    }

    uint32_t hash = 2166136261u;
    for (size_t index = 0; index < size; ++index) {
        hash ^= data[index];
        hash *= 16777619u;
    }
    return hash == 0 ? 1 : hash;
}

FlashCommandSequence make_flash_program_sequence(uint32_t address, uint16_t value) {
    FlashCommandSequence result {};
    if (value > 0xFFu) {
        result.status = SaveStatus::InvalidData;
        return result;
    }
    result.status = SaveStatus::Ok;
    result.command_count = 4;
    result.commands[0] = FlashCommand { 0x5555u, 0xAAu };
    result.commands[1] = FlashCommand { 0x2AAAu, 0x55u };
    result.commands[2] = FlashCommand { 0x5555u, 0xA0u };
    result.commands[3] = FlashCommand { address, static_cast<uint8_t>(value) };
    return result;
}

FlashCommandSequence make_flash_sector_erase_sequence(uint32_t sector_address) {
    FlashCommandSequence result {};
    result.status = SaveStatus::Ok;
    result.command_count = 6;
    result.commands[0] = FlashCommand { 0x5555u, 0xAAu };
    result.commands[1] = FlashCommand { 0x2AAAu, 0x55u };
    result.commands[2] = FlashCommand { 0x5555u, 0x80u };
    result.commands[3] = FlashCommand { 0x5555u, 0xAAu };
    result.commands[4] = FlashCommand { 0x2AAAu, 0x55u };
    result.commands[5] = FlashCommand { sector_address, 0x30u };
    return result;
}

EepromSerialFrame make_eeprom_read_frame(uint16_t address, uint8_t address_bits) {
    EepromSerialFrame result {};
    result.status = valid_eeprom_address(address, address_bits) ? SaveStatus::Ok : SaveStatus::InvalidData;
    result.address_bits = address_bits;
    result.address = address;
    if (result.status != SaveStatus::Ok) {
        return result;
    }

    append_eeprom_bit(result, 1);
    append_eeprom_bit(result, 1);
    for (int bit = static_cast<int>(address_bits) - 1; bit >= 0; --bit) {
        append_eeprom_bit(result, static_cast<uint8_t>((address >> bit) & 1u));
    }
    append_eeprom_bit(result, 0);
    return result;
}

EepromSerialFrame make_eeprom_write_frame(uint16_t address, uint8_t address_bits, const uint8_t* data) {
    EepromSerialFrame result {};
    result.status = valid_eeprom_address(address, address_bits) && data != nullptr
        ? SaveStatus::Ok
        : SaveStatus::InvalidData;
    result.address_bits = address_bits;
    result.address = address;
    if (result.status != SaveStatus::Ok) {
        return result;
    }

    append_eeprom_bit(result, 1);
    append_eeprom_bit(result, 0);
    for (int bit = static_cast<int>(address_bits) - 1; bit >= 0; --bit) {
        append_eeprom_bit(result, static_cast<uint8_t>((address >> bit) & 1u));
    }
    for (size_t byte_index = 0; byte_index < 8; ++byte_index) {
        for (int bit = 7; bit >= 0; --bit) {
            append_eeprom_bit(result, static_cast<uint8_t>((data[byte_index] >> bit) & 1u));
        }
    }
    append_eeprom_bit(result, 0);
    return result;
}

SaveStatus save_backend_status(CartridgeSaveDevice device) {
    return cartridge_save_capabilities(device).runtime_backend_available
        ? SaveStatus::Ok
        : SaveStatus::UnsupportedDevice;
}

SaveStatus configured_save_backend_status() {
    if (!valid_backend(active_backend)) return SaveStatus::UnsupportedDevice;
    if (active_backend.read_byte == flash1m_read_byte &&
        !probe_flash1m(static_cast<Flash1MBus*>(active_backend.user_data))) {
        return SaveStatus::UnsupportedDevice;
    }
    return SaveStatus::Ok;
}

SaveInfo inspect_save(SaveSlot slot) {
    if (!valid_active_slot(slot)) {
        return SaveInfo { false, 0, 0, 0, SaveStatus::InvalidSlot };
    }
    if (configured_save_backend_status() != SaveStatus::Ok) {
        return SaveInfo { false, 0, 0, 0, SaveStatus::UnsupportedDevice };
    }
    if (looks_erased(slot)) {
        return SaveInfo { false, 0, 0, 0, SaveStatus::NotFound };
    }

    uint32_t signature = read_u32(slot.offset);
    uint16_t version = read_u16(slot.offset + 4);
    uint16_t payload_size = read_u16(slot.offset + 6);
    uint32_t checksum = read_u32(slot.offset + 8);
    uint32_t sequence = read_u32(slot.offset + 12);

    if (signature != slot.signature) {
        return SaveInfo { false, payload_size, version, sequence, SaveStatus::NotFound };
    }
    if (version != slot.version) {
        return SaveInfo { true, payload_size, version, sequence, SaveStatus::VersionMismatch };
    }
    if (payload_size > payload_capacity(slot)) {
        return SaveInfo { true, payload_size, version, sequence, SaveStatus::TooLarge };
    }

    uint32_t computed = 2166136261u;
    for (uint16_t index = 0; index < payload_size; ++index) {
        computed ^= read_save_byte(payload_offset(slot) + index);
        computed *= 16777619u;
    }
    if (computed == 0) {
        computed = 1;
    }
    if (checksum != computed) {
        return SaveInfo { true, payload_size, version, sequence, SaveStatus::ChecksumMismatch };
    }

    return SaveInfo { true, payload_size, version, sequence, SaveStatus::Ok };
}

SaveStatus read_save(SaveSlot slot, void* destination, size_t destination_size, size_t* bytes_read) {
    if (bytes_read != nullptr) {
        *bytes_read = 0;
    }
    if (destination == nullptr && destination_size > 0) {
        return SaveStatus::InvalidData;
    }

    SaveInfo info = inspect_save(slot);
    if (info.status != SaveStatus::Ok) {
        return info.status;
    }
    if (destination_size < info.payload_size) {
        return SaveStatus::TooLarge;
    }

    uint8_t* out = static_cast<uint8_t*>(destination);
    for (uint16_t index = 0; index < info.payload_size; ++index) {
        out[index] = read_save_byte(payload_offset(slot) + index);
    }
    if (bytes_read != nullptr) {
        *bytes_read = info.payload_size;
    }
    return SaveStatus::Ok;
}

SaveStatus write_save(SaveSlot slot, const void* source, size_t source_size, uint32_t sequence) {
    if (!valid_active_slot(slot)) {
        return SaveStatus::InvalidSlot;
    }
    if (configured_save_backend_status() != SaveStatus::Ok) {
        return SaveStatus::UnsupportedDevice;
    }
    if (source == nullptr && source_size > 0) {
        return SaveStatus::InvalidData;
    }
    if (source_size > payload_capacity(slot) || source_size > 0xFFFFu) {
        return SaveStatus::TooLarge;
    }

    const uint8_t* input = static_cast<const uint8_t*>(source);
    uint32_t checksum = save_checksum(input, source_size);
    if (!erase_backend_range(slot.offset, slot.capacity) ||
        !write_bytes(payload_offset(slot), input, source_size) ||
        !write_u32(slot.offset, slot.signature) ||
        !write_u16(slot.offset + 4, slot.version) ||
        !write_u16(slot.offset + 6, static_cast<uint16_t>(source_size)) ||
        !write_u32(slot.offset + 8, checksum) ||
        !write_u32(slot.offset + 12, sequence)) {
        return SaveStatus::BackendFailure;
    }
    return SaveStatus::Ok;
}

SaveStatus clear_save(SaveSlot slot) {
    if (!valid_active_slot(slot)) {
        return SaveStatus::InvalidSlot;
    }
    if (configured_save_backend_status() != SaveStatus::Ok) {
        return SaveStatus::UnsupportedDevice;
    }
    return erase_backend_range(slot.offset, slot.capacity)
        ? SaveStatus::Ok
        : SaveStatus::BackendFailure;
}

SaveMetadata make_save_metadata(const char* title, uint32_t play_time_frames, uint32_t timestamp, uint16_t room_index, uint16_t flags) {
    SaveMetadata metadata {};
    if (title != nullptr) {
        size_t index = 0;
        while (index + 1 < save_metadata_title_length && title[index] != '\0' && title[index] != '\n') {
            metadata.title[index] = title[index];
            ++index;
        }
        metadata.title[index] = '\0';
    }
    metadata.play_time_frames = play_time_frames;
    metadata.timestamp = timestamp;
    metadata.room_index = room_index;
    metadata.flags = flags;
    return metadata;
}

bool format_save_play_time(uint32_t play_time_frames, char* destination, size_t destination_size) {
    if (destination == nullptr || destination_size == 0) {
        return false;
    }

    uint32_t total_seconds = play_time_frames / 60u;
    uint32_t seconds = total_seconds % 60u;
    uint32_t minutes_total = total_seconds / 60u;
    uint32_t minutes = minutes_total % 60u;
    uint32_t hours = minutes_total / 60u;
    char buffer[12] = {};
    size_t index = 0;

    auto append_digit = [&](uint32_t digit) {
        if (index + 1 < sizeof(buffer)) {
            buffer[index++] = static_cast<char>('0' + digit);
        }
    };
    auto append_two_digits = [&](uint32_t value) {
        append_digit((value / 10u) % 10u);
        append_digit(value % 10u);
    };
    auto append_number = [&](uint32_t value) {
        char digits[10] = {};
        size_t count = 0;
        do {
            digits[count++] = static_cast<char>('0' + (value % 10u));
            value /= 10u;
        } while (value > 0 && count < sizeof(digits));
        while (count > 0) {
            if (index + 1 < sizeof(buffer)) {
                buffer[index++] = digits[--count];
            } else {
                --count;
            }
        }
    };
    auto append_colon = [&]() {
        if (index + 1 < sizeof(buffer)) {
            buffer[index++] = ':';
        }
    };

    if (hours > 0) {
        append_number(hours);
        append_colon();
        append_two_digits(minutes);
        append_colon();
        append_two_digits(seconds);
    } else {
        append_two_digits(minutes);
        append_colon();
        append_two_digits(seconds);
    }
    buffer[index] = '\0';

    if (index + 1 > destination_size) {
        destination[0] = '\0';
        return false;
    }
    for (size_t out_index = 0; out_index <= index; ++out_index) {
        destination[out_index] = buffer[out_index];
    }
    return true;
}

SaveMetadataInfo inspect_save_metadata(SaveSlot slot) {
    SaveInfo info = inspect_save(slot);
    SaveMetadataInfo result { info.present, info.payload_size, info.version, info.sequence, info.status, SaveMetadata {} };
    if (info.status != SaveStatus::Ok) {
        return result;
    }
    if (info.payload_size < save_record_overhead) {
        result.status = SaveStatus::InvalidData;
        return result;
    }

    uint32_t offset = payload_offset(slot);
    uint8_t header[save_record_overhead] = {};
    for (uint32_t index = 0; index < save_record_overhead; ++index) {
        header[index] = read_save_byte(offset + index);
    }
    if (read_u32_from(header) != save_record_magic || read_u16_from(header + 4) != save_record_version) {
        result.status = SaveStatus::InvalidData;
        return result;
    }

    uint16_t payload_size = read_u16_from(header + 6);
    if (static_cast<uint32_t>(payload_size) + save_record_overhead != info.payload_size) {
        result.status = SaveStatus::InvalidData;
        return result;
    }

    for (size_t index = 0; index < save_metadata_title_length; ++index) {
        result.metadata.title[index] = static_cast<char>(header[8 + index]);
    }
    result.metadata.title[save_metadata_title_length - 1] = '\0';
    result.metadata.play_time_frames = read_u32_from(header + 24);
    result.metadata.timestamp = read_u32_from(header + 28);
    result.metadata.room_index = read_u16_from(header + 32);
    result.metadata.flags = read_u16_from(header + 34);
    result.payload_size = payload_size;
    return result;
}

SaveStatus read_save_record(SaveSlot slot, void* destination, size_t destination_size, SaveMetadata* metadata, size_t* bytes_read) {
    if (bytes_read != nullptr) {
        *bytes_read = 0;
    }
    if (destination == nullptr && destination_size > 0) {
        return SaveStatus::InvalidData;
    }

    SaveMetadataInfo info = inspect_save_metadata(slot);
    if (info.status != SaveStatus::Ok) {
        return info.status;
    }
    if (destination_size < info.payload_size) {
        return SaveStatus::TooLarge;
    }

    uint8_t* out = static_cast<uint8_t*>(destination);
    uint32_t data_offset = payload_offset(slot) + save_record_overhead;
    for (uint16_t index = 0; index < info.payload_size; ++index) {
        out[index] = read_save_byte(data_offset + index);
    }
    if (metadata != nullptr) {
        *metadata = info.metadata;
    }
    if (bytes_read != nullptr) {
        *bytes_read = info.payload_size;
    }
    return SaveStatus::Ok;
}

SaveStatus write_save_record(SaveSlot slot, const void* source, size_t source_size, const SaveMetadata& metadata, uint32_t sequence) {
    if (!valid_active_slot(slot)) {
        return SaveStatus::InvalidSlot;
    }
    if (configured_save_backend_status() != SaveStatus::Ok) {
        return SaveStatus::UnsupportedDevice;
    }
    if (source == nullptr && source_size > 0) {
        return SaveStatus::InvalidData;
    }
    if (source_size > 0xFFFFu || source_size + save_record_overhead > payload_capacity(slot)) {
        return SaveStatus::TooLarge;
    }

    uint32_t record_size = static_cast<uint32_t>(source_size + save_record_overhead);
    if (!erase_backend_range(slot.offset, slot.capacity)) {
        return SaveStatus::BackendFailure;
    }

    uint8_t header[save_record_overhead] = {};
    write_u32_to(header, save_record_magic);
    write_u16_to(header + 4, save_record_version);
    write_u16_to(header + 6, static_cast<uint16_t>(source_size));
    for (size_t index = 0; index + 1 < save_metadata_title_length; ++index) {
        char value = metadata.title[index];
        header[8 + index] = static_cast<uint8_t>(value == '\n' ? '\0' : value);
        if (value == '\0' || value == '\n') {
            break;
        }
    }
    write_u32_to(header + 24, metadata.play_time_frames);
    write_u32_to(header + 28, metadata.timestamp);
    write_u16_to(header + 32, metadata.room_index);
    write_u16_to(header + 34, metadata.flags);

    uint32_t checksum = 2166136261u;
    for (uint32_t index = 0; index < save_record_overhead; ++index) {
        if (!write_save_byte(payload_offset(slot) + index, header[index])) {
            return SaveStatus::BackendFailure;
        }
        checksum ^= header[index];
        checksum *= 16777619u;
    }

    const uint8_t* input = static_cast<const uint8_t*>(source);
    for (size_t index = 0; index < source_size; ++index) {
        if (!write_save_byte(payload_offset(slot) + save_record_overhead + static_cast<uint32_t>(index), input[index])) {
            return SaveStatus::BackendFailure;
        }
        checksum ^= input[index];
        checksum *= 16777619u;
    }
    if (checksum == 0) {
        checksum = 1;
    }

    if (!write_u32(slot.offset, slot.signature) ||
        !write_u16(slot.offset + 4, slot.version) ||
        !write_u16(slot.offset + 6, static_cast<uint16_t>(record_size)) ||
        !write_u32(slot.offset + 8, checksum) ||
        !write_u32(slot.offset + 12, sequence)) {
        return SaveStatus::BackendFailure;
    }
    return SaveStatus::Ok;
}

SaveInfo inspect_save_slot(SaveBank bank, size_t slot_index) {
    if (!valid_active_bank(bank) || slot_index >= bank.slot_count) {
        return SaveInfo { false, 0, 0, 0, SaveStatus::InvalidSlot };
    }
    return inspect_save(save_slot_at(bank, slot_index));
}

SaveStatus read_save_slot(SaveBank bank, size_t slot_index, void* destination, size_t destination_size, size_t* bytes_read) {
    if (!valid_active_bank(bank) || slot_index >= bank.slot_count) {
        if (bytes_read != nullptr) {
            *bytes_read = 0;
        }
        return SaveStatus::InvalidSlot;
    }
    return read_save(save_slot_at(bank, slot_index), destination, destination_size, bytes_read);
}

SaveStatus write_save_slot(SaveBank bank, size_t slot_index, const void* source, size_t source_size, uint32_t sequence) {
    if (!valid_active_bank(bank) || slot_index >= bank.slot_count) {
        return SaveStatus::InvalidSlot;
    }
    return write_save(save_slot_at(bank, slot_index), source, source_size, sequence);
}

SaveStatus clear_save_slot(SaveBank bank, size_t slot_index) {
    if (!valid_active_bank(bank) || slot_index >= bank.slot_count) {
        return SaveStatus::InvalidSlot;
    }
    return clear_save(save_slot_at(bank, slot_index));
}

SaveMetadataInfo inspect_save_slot_metadata(SaveBank bank, size_t slot_index) {
    if (!valid_active_bank(bank) || slot_index >= bank.slot_count) {
        return SaveMetadataInfo { false, 0, 0, 0, SaveStatus::InvalidSlot, SaveMetadata {} };
    }
    return inspect_save_metadata(save_slot_at(bank, slot_index));
}

SaveStatus read_save_slot_record(SaveBank bank, size_t slot_index, void* destination, size_t destination_size, SaveMetadata* metadata, size_t* bytes_read) {
    if (!valid_active_bank(bank) || slot_index >= bank.slot_count) {
        if (bytes_read != nullptr) {
            *bytes_read = 0;
        }
        return SaveStatus::InvalidSlot;
    }
    return read_save_record(save_slot_at(bank, slot_index), destination, destination_size, metadata, bytes_read);
}

SaveStatus write_save_slot_record(SaveBank bank, size_t slot_index, const void* source, size_t source_size, const SaveMetadata& metadata, uint32_t sequence) {
    if (!valid_active_bank(bank) || slot_index >= bank.slot_count) {
        return SaveStatus::InvalidSlot;
    }
    return write_save_record(save_slot_at(bank, slot_index), source, source_size, metadata, sequence);
}

SaveStatus clear_save_bank(SaveBank bank) {
    if (!valid_active_bank(bank)) {
        return SaveStatus::InvalidSlot;
    }
    for (size_t index = 0; index < bank.slot_count; ++index) {
        SaveStatus status = clear_save(save_slot_at(bank, index));
        if (status != SaveStatus::Ok) {
            return status;
        }
    }
    return SaveStatus::Ok;
}

size_t count_valid_saves(SaveBank bank) {
    if (!valid_active_bank(bank)) {
        return 0;
    }
    size_t count = 0;
    for (size_t index = 0; index < bank.slot_count; ++index) {
        if (inspect_save(save_slot_at(bank, index)).status == SaveStatus::Ok) {
            ++count;
        }
    }
    return count;
}

int find_latest_save_slot(SaveBank bank) {
    if (!valid_active_bank(bank)) {
        return -1;
    }
    int latest_index = -1;
    uint32_t latest_sequence = 0;
    for (size_t index = 0; index < bank.slot_count; ++index) {
        SaveInfo info = inspect_save(save_slot_at(bank, index));
        if (info.status == SaveStatus::Ok && (latest_index < 0 || info.sequence >= latest_sequence)) {
            latest_index = static_cast<int>(index);
            latest_sequence = info.sequence;
        }
    }
    return latest_index;
}

void format_save_memory() {
    (void)erase_backend_range(0, active_backend_capacity());
}

bool is_valid_universal_save_data(const UniversalSaveData& data) {
    if (data.magic != universal_save_magic ||
        data.schema != universal_save_schema ||
        static_cast<uint8_t>(data.runtime) > static_cast<uint8_t>(UniversalSaveRuntime::Luta) ||
        data.room_index < 0 ||
        data.payload_size > universal_save_payload_capacity) {
        return false;
    }
    for (size_t variable_index = 0; variable_index < text_variable_count; ++variable_index) {
        bool terminated = false;
        for (size_t character_index = 0; character_index <= text_variable_max_length; ++character_index) {
            if (data.text_variables[variable_index][character_index] == '\0') {
                terminated = true;
                break;
            }
        }
        if (!terminated) return false;
    }
    return true;
}

bool make_universal_save_data(
    UniversalSaveData& data,
    UniversalSaveRuntime runtime,
    int room_index,
    int player_x,
    int player_y,
    int camera_x,
    int camera_y,
    const int* variables,
    size_t variable_count,
    const int* inventory,
    size_t inventory_count,
    const int* equipped_items,
    size_t equipped_item_count,
    uint32_t play_time_frames,
    uint16_t flags,
    const void* payload,
    size_t payload_size,
    const char (*text_variables)[text_variable_max_length + 1],
    size_t text_variable_count
) {
    if (room_index < 0 || payload_size > universal_save_payload_capacity ||
        (payload_size > 0 && payload == nullptr)) {
        return false;
    }
    data.magic = universal_save_magic;
    data.schema = universal_save_schema;
    data.runtime = runtime;
    data.dialogue_locale = active_dialogue_locale_id();
    data.room_index = room_index;
    data.player_x = player_x;
    data.player_y = player_y;
    data.camera_x = camera_x;
    data.camera_y = camera_y;
    for (size_t index = 0; index < universal_save_variable_count; ++index) {
        data.variables[index] = variables != nullptr && index < variable_count ? variables[index] : 0;
    }
    for (size_t variable_index = 0; variable_index < gbs::text_variable_count; ++variable_index) {
        for (size_t character_index = 0; character_index <= gbs::text_variable_max_length; ++character_index) {
            data.text_variables[variable_index][character_index] =
                text_variables != nullptr && variable_index < text_variable_count
                    ? text_variables[variable_index][character_index]
                    : '\0';
        }
        data.text_variables[variable_index][gbs::text_variable_max_length] = '\0';
    }
    for (size_t index = 0; index < universal_save_inventory_count; ++index) {
        data.inventory[index] = inventory != nullptr && index < inventory_count ? inventory[index] : 0;
    }
    for (size_t index = 0; index < universal_save_equipment_slot_count; ++index) {
        data.equipped_items[index] = equipped_items != nullptr && index < equipped_item_count ? equipped_items[index] : -1;
    }
    data.play_time_frames = play_time_frames;
    data.flags = flags;
    data.payload_size = static_cast<uint16_t>(payload_size);
    const uint8_t* source = static_cast<const uint8_t*>(payload);
    for (size_t index = 0; index < universal_save_payload_capacity; ++index) {
        data.payload[index] = index < payload_size ? source[index] : 0;
    }
    return is_valid_universal_save_data(data);
}

bool read_universal_save_common_state(
    const UniversalSaveData& data,
    int* variables,
    size_t variable_count,
    int* inventory,
    size_t inventory_count,
    int* equipped_items,
    size_t equipped_item_count,
    char (*text_variables)[text_variable_max_length + 1],
    size_t text_variable_count
) {
    if (!is_valid_universal_save_data(data) ||
        (variables == nullptr && variable_count > 0) ||
        (inventory == nullptr && inventory_count > 0) ||
        (equipped_items == nullptr && equipped_item_count > 0)) {
        return false;
    }
    for (size_t index = 0; index < variable_count; ++index) {
        variables[index] = index < universal_save_variable_count ? data.variables[index] : 0;
    }
    for (size_t index = 0; index < inventory_count; ++index) {
        inventory[index] = index < universal_save_inventory_count ? data.inventory[index] : 0;
    }
    for (size_t index = 0; index < equipped_item_count; ++index) {
        equipped_items[index] = index < universal_save_equipment_slot_count ? data.equipped_items[index] : -1;
    }
    if (text_variables != nullptr) {
        for (size_t variable_index = 0; variable_index < text_variable_count; ++variable_index) {
            for (size_t character_index = 0; character_index <= text_variable_max_length; ++character_index) {
                text_variables[variable_index][character_index] = variable_index < gbs::text_variable_count
                    ? data.text_variables[variable_index][character_index]
                    : '\0';
            }
            text_variables[variable_index][text_variable_max_length] = '\0';
        }
    }
    configure_dialogue_locale_id(data.dialogue_locale);
    return true;
}

bool read_universal_save_payload(
    const UniversalSaveData& data,
    UniversalSaveRuntime expected_runtime,
    void* destination,
    size_t destination_size
) {
    if (!is_valid_universal_save_data(data) || data.runtime != expected_runtime ||
        destination == nullptr || destination_size != data.payload_size) {
        return false;
    }
    uint8_t* output = static_cast<uint8_t*>(destination);
    for (size_t index = 0; index < destination_size; ++index) {
        output[index] = data.payload[index];
    }
    return true;
}

} // namespace gbs
