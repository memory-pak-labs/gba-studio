#pragma once

#include <stddef.h>
#include <stdint.h>
#include "gbs/info.hpp"
#include "gbs/runtime_capabilities.hpp"
#include "gbs/text_variables.hpp"

namespace gbs {

constexpr uint32_t save_sram_size = 32u * 1024u;
constexpr uint32_t flash1m_sector_size = 4096u;
constexpr uint32_t save_header_size = 16u;
constexpr size_t save_metadata_title_length = 16u;
constexpr uint32_t save_record_overhead = 40u;
constexpr uint16_t universal_save_schema = 4;
constexpr size_t universal_save_variable_count = 64;
constexpr size_t universal_save_inventory_count = 16;
constexpr size_t universal_save_equipment_slot_count = 8;
constexpr size_t universal_save_payload_capacity = 588;

enum class UniversalSaveRuntime : uint8_t {
    TopDown = 0,
    Platformer = 1,
    Isometric = 2,
    Menu = 3,
    Shmup = 4,
    PointClick = 5,
    DungeonCrawler = 6,
    Racing = 7,
    Cutscene = 8,
    VisualNovel = 9,
    WorldMap = 10,
    BattleRpg = 11,
    Luta = 12
};

struct UniversalSaveData {
    uint32_t magic;
    uint16_t schema;
    UniversalSaveRuntime runtime;
    uint8_t dialogue_locale;
    int32_t room_index;
    int32_t player_x;
    int32_t player_y;
    int32_t camera_x;
    int32_t camera_y;
    int32_t variables[universal_save_variable_count];
    char text_variables[text_variable_count][text_variable_max_length + 1];
    int32_t inventory[universal_save_inventory_count];
    int32_t equipped_items[universal_save_equipment_slot_count];
    uint32_t play_time_frames;
    uint16_t flags;
    uint16_t payload_size;
    uint8_t payload[universal_save_payload_capacity];
};

enum class SaveStatus : uint8_t {
    Ok = 0,
    InvalidSlot = 1,
    InvalidData = 2,
    TooLarge = 3,
    NotFound = 4,
    VersionMismatch = 5,
    ChecksumMismatch = 6,
    UnsupportedDevice = 7,
    BackendFailure = 8
};

using SaveBackendReadByte = uint8_t (*)(void* user_data, uint32_t offset);
using SaveBackendWriteByte = bool (*)(void* user_data, uint32_t offset, uint8_t value);
using SaveBackendErase = bool (*)(void* user_data, uint32_t offset, uint32_t size);

// A backend owns the cartridge protocol. The save format only asks for byte
// reads, byte writes and an optional erase operation, so SRAM, Flash and
// EEPROM can be tested through the same bounded record implementation without
// making the runtime probe an unknown cartridge.
struct SaveBackend {
    CartridgeSaveDevice device;
    uint32_t capacity_bytes;
    uint16_t write_granularity_bytes;
    uint16_t erase_granularity_bytes;
    void* user_data;
    SaveBackendReadByte read_byte;
    SaveBackendWriteByte write_byte;
    SaveBackendErase erase;
};

struct Flash1MBus {
    void* user_data;
    uint8_t (*read)(void* user_data, uint32_t address);
    void (*write)(void* user_data, uint32_t address, uint8_t value);
};

SaveBackend make_flash1m_backend(Flash1MBus* bus);

struct FlashCommand {
    uint32_t address;
    uint8_t value;
};

constexpr size_t flash_command_sequence_capacity = 6;

struct FlashCommandSequence {
    SaveStatus status;
    uint8_t command_count;
    FlashCommand commands[flash_command_sequence_capacity];
};

constexpr size_t eeprom_serial_frame_capacity_bits = 81;

struct EepromSerialFrame {
    SaveStatus status;
    uint8_t address_bits;
    uint16_t address;
    uint8_t bit_count;
    uint8_t bits[eeprom_serial_frame_capacity_bits];
};

struct SaveSlot {
    uint32_t offset;
    uint32_t capacity;
    uint32_t signature;
    uint16_t version;
};

struct SaveBank {
    uint32_t offset;
    uint32_t slot_capacity;
    uint8_t slot_count;
    uint32_t signature;
    uint16_t version;
};

enum class SaveMenuLayout : uint8_t {
    Cards = 0,
    List = 1
};

struct SaveMenuConfig {
    const char* continue_label;
    const char* load_label;
    const char* delete_label;
    SaveMenuLayout layout;
    uint8_t selected_slot;
    bool confirm_delete;
    bool show_player_name;
    bool show_play_time;
    bool show_location;
    bool enabled;
    const char* profile_id = "default";
    bool custom_labels = false;
};

struct SaveInfo {
    bool present;
    uint16_t payload_size;
    uint16_t version;
    uint32_t sequence;
    SaveStatus status;
};

struct SaveMetadata {
    char title[save_metadata_title_length];
    uint32_t play_time_frames;
    uint32_t timestamp;
    uint16_t room_index;
    uint16_t flags;
};

struct SaveMetadataInfo {
    bool present;
    uint16_t payload_size;
    uint16_t version;
    uint32_t sequence;
    SaveStatus status;
    SaveMetadata metadata;
};

constexpr uint32_t make_save_signature(char a, char b, char c, char d) {
    return static_cast<uint32_t>(static_cast<uint8_t>(a)) |
        (static_cast<uint32_t>(static_cast<uint8_t>(b)) << 8) |
        (static_cast<uint32_t>(static_cast<uint8_t>(c)) << 16) |
        (static_cast<uint32_t>(static_cast<uint8_t>(d)) << 24);
}

constexpr uint32_t universal_save_magic = make_save_signature('G', 'B', 'U', 'S');

constexpr bool is_valid_save_slot(SaveSlot slot) {
    return slot.capacity > save_header_size &&
        slot.offset < save_sram_size &&
        slot.capacity <= save_sram_size &&
        slot.offset + slot.capacity <= save_sram_size &&
        slot.signature != 0 &&
        slot.signature != 0xFFFFFFFFu;
}

constexpr bool is_valid_save_slot_for_capacity(SaveSlot slot, uint32_t capacity_bytes) {
    return slot.capacity > save_header_size &&
        slot.offset < capacity_bytes &&
        static_cast<uint64_t>(slot.capacity) <= capacity_bytes &&
        static_cast<uint64_t>(slot.offset) + slot.capacity <= capacity_bytes &&
        slot.signature != 0 &&
        slot.signature != 0xFFFFFFFFu;
}

constexpr bool is_valid_save_bank(SaveBank bank) {
    return bank.slot_count > 0 &&
        bank.slot_capacity > save_header_size &&
        bank.offset < save_sram_size &&
        static_cast<uint64_t>(bank.slot_capacity) * bank.slot_count <= save_sram_size &&
        bank.offset + static_cast<uint32_t>(bank.slot_capacity * bank.slot_count) <= save_sram_size &&
        bank.signature != 0 &&
        bank.signature != 0xFFFFFFFFu;
}

constexpr bool is_valid_save_bank_for_capacity(SaveBank bank, uint32_t capacity_bytes) {
    const uint64_t total_size = static_cast<uint64_t>(bank.slot_capacity) * bank.slot_count;
    return bank.slot_count > 0 &&
        bank.slot_capacity > save_header_size &&
        bank.offset < capacity_bytes &&
        total_size <= capacity_bytes &&
        static_cast<uint64_t>(bank.offset) + total_size <= capacity_bytes &&
        bank.signature != 0 &&
        bank.signature != 0xFFFFFFFFu;
}

constexpr SaveSlot save_slot_at(SaveBank bank, size_t slot_index) {
    return SaveSlot {
        bank.offset + static_cast<uint32_t>(slot_index) * bank.slot_capacity,
        bank.slot_capacity,
        bank.signature,
        bank.version
    };
}

uint32_t save_checksum(const uint8_t* data, size_t size);
SaveInfo inspect_save(SaveSlot slot);
SaveStatus read_save(SaveSlot slot, void* destination, size_t destination_size, size_t* bytes_read = nullptr);
SaveStatus write_save(SaveSlot slot, const void* source, size_t source_size, uint32_t sequence = 0);
SaveStatus clear_save(SaveSlot slot);
SaveMetadata make_save_metadata(const char* title, uint32_t play_time_frames = 0, uint32_t timestamp = 0, uint16_t room_index = 0, uint16_t flags = 0);
bool format_save_play_time(uint32_t play_time_frames, char* destination, size_t destination_size);
SaveMetadataInfo inspect_save_metadata(SaveSlot slot);
SaveStatus read_save_record(SaveSlot slot, void* destination, size_t destination_size, SaveMetadata* metadata = nullptr, size_t* bytes_read = nullptr);
SaveStatus write_save_record(SaveSlot slot, const void* source, size_t source_size, const SaveMetadata& metadata, uint32_t sequence = 0);
SaveInfo inspect_save_slot(SaveBank bank, size_t slot_index);
SaveStatus read_save_slot(SaveBank bank, size_t slot_index, void* destination, size_t destination_size, size_t* bytes_read = nullptr);
SaveStatus write_save_slot(SaveBank bank, size_t slot_index, const void* source, size_t source_size, uint32_t sequence = 0);
SaveStatus clear_save_slot(SaveBank bank, size_t slot_index);
SaveMetadataInfo inspect_save_slot_metadata(SaveBank bank, size_t slot_index);
SaveStatus read_save_slot_record(SaveBank bank, size_t slot_index, void* destination, size_t destination_size, SaveMetadata* metadata = nullptr, size_t* bytes_read = nullptr);
SaveStatus write_save_slot_record(SaveBank bank, size_t slot_index, const void* source, size_t source_size, const SaveMetadata& metadata, uint32_t sequence = 0);
SaveStatus clear_save_bank(SaveBank bank);
size_t count_valid_saves(SaveBank bank);
int find_latest_save_slot(SaveBank bank);
void format_save_memory();
FlashCommandSequence make_flash_program_sequence(uint32_t address, uint16_t value);
FlashCommandSequence make_flash_sector_erase_sequence(uint32_t sector_address);
EepromSerialFrame make_eeprom_read_frame(uint16_t address, uint8_t address_bits);
EepromSerialFrame make_eeprom_write_frame(uint16_t address, uint8_t address_bits, const uint8_t* data);
SaveStatus save_backend_status(CartridgeSaveDevice device);
SaveStatus configured_save_backend_status();
bool configure_save_backend(const SaveBackend& backend);
void reset_save_backend();
SaveBackend active_save_backend();
bool is_valid_universal_save_data(const UniversalSaveData& data);
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
    const char (*text_variables)[text_variable_max_length + 1] = nullptr,
    size_t text_variable_count = 0
);
bool read_universal_save_common_state(
    const UniversalSaveData& data,
    int* variables,
    size_t variable_count,
    int* inventory,
    size_t inventory_count,
    int* equipped_items,
    size_t equipped_item_count,
    char (*text_variables)[text_variable_max_length + 1] = nullptr,
    size_t text_variable_count = 0
);
bool read_universal_save_payload(
    const UniversalSaveData& data,
    UniversalSaveRuntime expected_runtime,
    void* destination,
    size_t destination_size
);

} // namespace gbs
