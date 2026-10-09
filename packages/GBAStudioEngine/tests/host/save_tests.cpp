#include <cassert>
#include <stdint.h>
#include "gbs/dialogue.hpp"
#include "gbs/save.hpp"

namespace {

constexpr gbs::SaveSlot main_slot {
    0,
    256,
    gbs::make_save_signature('G', 'B', 'S', '1'),
    1
};

constexpr gbs::SaveBank save_bank {
    1024,
    256,
    3,
    gbs::make_save_signature('G', 'B', 'B', 'K'),
    1
};

struct TestSaveData {
    uint16_t room;
    int16_t player_x;
    int16_t player_y;
    int16_t variables[4];
};

struct FakeCartridgeState {
    uint8_t bytes[64u * 1024u];
    uint32_t erase_calls = 0;
};

struct FakeFlash1M {
    uint8_t bytes[gbs::save_sram_size];
    bool id_mode = false;
    bool program_next = false;
    bool erase_armed = false;
    bool bank_switch_next = false;
    uint8_t current_bank = 0;
    uint8_t device_id = 0x09u;
    uint32_t erased_sectors = 0;
};

uint8_t fake_flash1m_read(void* user_data, uint32_t address) {
    FakeFlash1M& state = *static_cast<FakeFlash1M*>(user_data);
    if (state.id_mode && address < 2u) return address == 0u ? 0xC2u : state.device_id;
    return state.bytes[address];
}

void fake_flash1m_write(void* user_data, uint32_t address, uint8_t value) {
    FakeFlash1M& state = *static_cast<FakeFlash1M*>(user_data);
    if (state.bank_switch_next && address == 0u) {
        state.current_bank = value;
        state.bank_switch_next = false;
        return;
    }
    if (address == 0x5555u && value == 0xF0u && !state.program_next) { state.id_mode = false; return; }
    if (address == 0x5555u && value == 0xB0u) { state.bank_switch_next = true; return; }
    if (address == 0x5555u && value == 0x90u) { state.id_mode = true; return; }
    if (address == 0x5555u && value == 0xA0u) { state.program_next = true; return; }
    if (address == 0x5555u && value == 0x80u) { state.erase_armed = true; return; }
    if (state.erase_armed && value == 0x30u && address % 4096u == 0u) {
        for (uint32_t index = 0; index < 4096u; ++index) state.bytes[address + index] = 0xFFu;
        ++state.erased_sectors;
        state.erase_armed = false;
        return;
    }
    if (state.program_next) {
        state.bytes[address] &= value;
        state.program_next = false;
    }
}

void test_flash1m_backend_probes_and_keeps_save_slots_in_separate_sectors() {
    static FakeFlash1M cartridge {};
    for (uint8_t& byte : cartridge.bytes) byte = 0xFFu;
    cartridge.id_mode = false;
    cartridge.program_next = false;
    cartridge.erase_armed = false;
    cartridge.bank_switch_next = false;
    cartridge.current_bank = 0;
    cartridge.erased_sectors = 0;
    gbs::Flash1MBus bus { &cartridge, fake_flash1m_read, fake_flash1m_write };
    assert(gbs::configure_save_backend(gbs::make_flash1m_backend(&bus)));
    assert(gbs::configured_save_backend_status() == gbs::SaveStatus::Ok);
    assert(cartridge.current_bank == 0);
    const gbs::SaveBank bank { 0, 4096, 2, gbs::make_save_signature('F', 'L', 'S', 'H'), 1 };
    const uint8_t first[] = { 1, 2, 3 };
    const uint8_t second[] = { 4, 5, 6 };
    assert(gbs::write_save_slot(bank, 0, first, sizeof(first)) == gbs::SaveStatus::Ok);
    assert(gbs::write_save_slot(bank, 1, second, sizeof(second)) == gbs::SaveStatus::Ok);
    assert(cartridge.erased_sectors == 0);
    assert(gbs::clear_save_slot(bank, 0) == gbs::SaveStatus::Ok);
    assert(cartridge.erased_sectors == 1);
    uint8_t loaded[sizeof(second)] = {};
    assert(gbs::read_save_slot(bank, 1, loaded, sizeof(loaded)) == gbs::SaveStatus::Ok);
    assert(loaded[0] == 4 && loaded[2] == 6);
    const gbs::SaveMetadata metadata = gbs::make_save_metadata("Flash slot", 3600);
    assert(gbs::write_save_slot_record(bank, 0, first, sizeof(first), metadata) == gbs::SaveStatus::Ok);
    gbs::reset_save_backend();
    assert(gbs::configure_save_backend(gbs::make_flash1m_backend(&bus)));
    uint8_t restored[sizeof(first)] = {};
    gbs::SaveMetadata restored_metadata {};
    assert(gbs::read_save_slot_record(bank, 0, restored, sizeof(restored), &restored_metadata) == gbs::SaveStatus::Ok);
    assert(restored[0] == 1 && restored[2] == 3);
    assert(restored_metadata.play_time_frames == 3600);
    assert(gbs::read_save_slot(bank, 1, loaded, sizeof(loaded)) == gbs::SaveStatus::Ok);
    const gbs::SaveSlot misaligned { 2048, 2048, bank.signature, 1 };
    assert(gbs::write_save(misaligned, first, sizeof(first)) == gbs::SaveStatus::InvalidSlot);
    gbs::reset_save_backend();

    cartridge.device_id = 0x00u;
    gbs::Flash1MBus wrong_bus { &cartridge, fake_flash1m_read, fake_flash1m_write };
    assert(gbs::configure_save_backend(gbs::make_flash1m_backend(&wrong_bus)));
    assert(gbs::configured_save_backend_status() == gbs::SaveStatus::UnsupportedDevice);
    gbs::reset_save_backend();
}

uint8_t fake_cartridge_read(void* user_data, uint32_t offset) {
    return static_cast<FakeCartridgeState*>(user_data)->bytes[offset];
}

bool fake_cartridge_write(void* user_data, uint32_t offset, uint8_t value) {
    static_cast<FakeCartridgeState*>(user_data)->bytes[offset] = value;
    return true;
}

bool fake_cartridge_erase(void* user_data, uint32_t offset, uint32_t size) {
    FakeCartridgeState& state = *static_cast<FakeCartridgeState*>(user_data);
    ++state.erase_calls;
    for (uint32_t index = 0; index < size; ++index) {
        state.bytes[offset + index] = 0xFFu;
    }
    return true;
}

void test_save_slot_validation() {
    assert(gbs::is_valid_save_slot(main_slot));
    assert(!gbs::is_valid_save_slot(gbs::SaveSlot { 0, gbs::save_header_size, main_slot.signature, 1 }));
    assert(!gbs::is_valid_save_slot(gbs::SaveSlot { gbs::save_sram_size - 8, 16, main_slot.signature, 1 }));
    assert(!gbs::is_valid_save_slot(gbs::SaveSlot { 0, 128, 0, 1 }));

    assert(gbs::is_valid_save_bank(save_bank));
    assert(gbs::save_slot_at(save_bank, 2).offset == save_bank.offset + save_bank.slot_capacity * 2);
    assert(!gbs::is_valid_save_bank(gbs::SaveBank { 0, gbs::save_header_size, 3, save_bank.signature, 1 }));
    assert(!gbs::is_valid_save_bank(gbs::SaveBank { 0, 256, 0, save_bank.signature, 1 }));
    assert(!gbs::is_valid_save_bank(gbs::SaveBank { gbs::save_sram_size - 128, 256, 2, save_bank.signature, 1 }));
}

void test_write_inspect_and_read_save() {
    gbs::format_save_memory();
    TestSaveData data { 2, 72, 88, { 1, 3, 5, 8 } };

    assert(gbs::write_save(main_slot, &data, sizeof(data), 42) == gbs::SaveStatus::Ok);
    gbs::SaveInfo info = gbs::inspect_save(main_slot);
    assert(info.present);
    assert(info.status == gbs::SaveStatus::Ok);
    assert(info.payload_size == sizeof(data));
    assert(info.version == 1);
    assert(info.sequence == 42);

    TestSaveData loaded {};
    size_t bytes_read = 0;
    assert(gbs::read_save(main_slot, &loaded, sizeof(loaded), &bytes_read) == gbs::SaveStatus::Ok);
    assert(bytes_read == sizeof(data));
    assert(loaded.room == 2);
    assert(loaded.player_x == 72);
    assert(loaded.variables[3] == 8);
}

void test_read_rejects_small_destination() {
    gbs::format_save_memory();
    TestSaveData data { 1, 8, 16, { 0, 0, 0, 0 } };
    uint8_t tiny[2] = {};

    assert(gbs::write_save(main_slot, &data, sizeof(data), 7) == gbs::SaveStatus::Ok);
    assert(gbs::read_save(main_slot, tiny, sizeof(tiny)) == gbs::SaveStatus::TooLarge);
}

void test_version_mismatch_and_clear() {
    gbs::format_save_memory();
    TestSaveData data { 3, 20, 24, { 9, 0, 0, 0 } };
    gbs::SaveSlot version_two {
        main_slot.offset,
        main_slot.capacity,
        main_slot.signature,
        2
    };

    assert(gbs::write_save(main_slot, &data, sizeof(data), 1) == gbs::SaveStatus::Ok);
    gbs::SaveInfo mismatch = gbs::inspect_save(version_two);
    assert(mismatch.present);
    assert(mismatch.status == gbs::SaveStatus::VersionMismatch);

    assert(gbs::clear_save(main_slot) == gbs::SaveStatus::Ok);
    gbs::SaveInfo empty = gbs::inspect_save(main_slot);
    assert(!empty.present);
    assert(empty.status == gbs::SaveStatus::NotFound);
}

void test_capacity_and_null_validation() {
    gbs::format_save_memory();
    uint8_t payload[32] = {};
    gbs::SaveSlot small_slot {
        512,
        gbs::save_header_size + 4,
        gbs::make_save_signature('T', 'I', 'N', 'Y'),
        1
    };

    assert(gbs::write_save(small_slot, payload, sizeof(payload), 0) == gbs::SaveStatus::TooLarge);
    assert(gbs::write_save(main_slot, nullptr, 1, 0) == gbs::SaveStatus::InvalidData);
    assert(gbs::read_save(main_slot, nullptr, 1) == gbs::SaveStatus::InvalidData);
}

void test_save_record_metadata_roundtrip() {
    gbs::format_save_memory();
    TestSaveData data { 4, 96, 104, { 7, 6, 5, 4 } };
    gbs::SaveMetadata metadata = gbs::make_save_metadata("ROOM 4", 3600, 123456, 4, 9);

    assert(gbs::write_save_record(main_slot, &data, sizeof(data), metadata, 77) == gbs::SaveStatus::Ok);

    gbs::SaveMetadataInfo meta_info = gbs::inspect_save_metadata(main_slot);
    assert(meta_info.present);
    assert(meta_info.status == gbs::SaveStatus::Ok);
    assert(meta_info.payload_size == sizeof(data));
    assert(meta_info.sequence == 77);
    assert(meta_info.metadata.title[0] == 'R');
    assert(meta_info.metadata.title[5] == '4');
    assert(meta_info.metadata.play_time_frames == 3600);
    assert(meta_info.metadata.timestamp == 123456);
    assert(meta_info.metadata.room_index == 4);
    assert(meta_info.metadata.flags == 9);

    TestSaveData loaded {};
    gbs::SaveMetadata loaded_metadata {};
    size_t bytes_read = 0;
    assert(gbs::read_save_record(main_slot, &loaded, sizeof(loaded), &loaded_metadata, &bytes_read) == gbs::SaveStatus::Ok);
    assert(bytes_read == sizeof(data));
    assert(loaded.room == 4);
    assert(loaded.player_y == 104);
    assert(loaded.variables[0] == 7);
    assert(loaded_metadata.room_index == 4);
    assert(loaded_metadata.play_time_frames == 3600);
}

void test_format_save_play_time() {
    char buffer[12] = {};

    assert(gbs::format_save_play_time(0, buffer, sizeof(buffer)));
    assert(buffer[0] == '0');
    assert(buffer[1] == '0');
    assert(buffer[2] == ':');
    assert(buffer[3] == '0');
    assert(buffer[4] == '0');
    assert(buffer[5] == '\0');

    assert(gbs::format_save_play_time((1 * 60 + 5) * 60, buffer, sizeof(buffer)));
    assert(buffer[0] == '0');
    assert(buffer[1] == '1');
    assert(buffer[2] == ':');
    assert(buffer[3] == '0');
    assert(buffer[4] == '5');

    assert(gbs::format_save_play_time((2 * 3600 + 3 * 60 + 4) * 60, buffer, sizeof(buffer)));
    assert(buffer[0] == '2');
    assert(buffer[1] == ':');
    assert(buffer[2] == '0');
    assert(buffer[3] == '3');
    assert(buffer[5] == '0');
    assert(buffer[6] == '4');

    char tiny[4] = {};
    assert(!gbs::format_save_play_time((10 * 60 + 30) * 60, tiny, sizeof(tiny)));
    assert(tiny[0] == '\0');
}

void test_save_record_rejects_raw_save_and_small_destination() {
    gbs::format_save_memory();
    TestSaveData data { 2, 16, 24, { 0, 0, 0, 0 } };
    uint8_t tiny[2] = {};

    assert(gbs::write_save(main_slot, &data, sizeof(data), 5) == gbs::SaveStatus::Ok);
    assert(gbs::inspect_save_metadata(main_slot).status == gbs::SaveStatus::InvalidData);
    assert(gbs::read_save_record(main_slot, &data, sizeof(data)) == gbs::SaveStatus::InvalidData);

    gbs::SaveMetadata metadata = gbs::make_save_metadata("SMALL");
    assert(gbs::write_save_record(main_slot, &data, sizeof(data), metadata, 6) == gbs::SaveStatus::Ok);
    assert(gbs::read_save_record(main_slot, tiny, sizeof(tiny)) == gbs::SaveStatus::TooLarge);
}

void test_save_bank_write_read_and_latest_slot() {
    gbs::format_save_memory();
    TestSaveData first { 1, 8, 16, { 1, 0, 0, 0 } };
    TestSaveData second { 2, 32, 40, { 2, 0, 0, 0 } };
    TestSaveData third { 3, 64, 80, { 3, 0, 0, 0 } };

    assert(gbs::write_save_slot(save_bank, 0, &first, sizeof(first), 10) == gbs::SaveStatus::Ok);
    assert(gbs::write_save_slot(save_bank, 1, &second, sizeof(second), 30) == gbs::SaveStatus::Ok);
    assert(gbs::write_save_slot(save_bank, 2, &third, sizeof(third), 20) == gbs::SaveStatus::Ok);
    assert(gbs::count_valid_saves(save_bank) == 3);
    assert(gbs::find_latest_save_slot(save_bank) == 1);

    TestSaveData loaded {};
    size_t bytes_read = 0;
    assert(gbs::read_save_slot(save_bank, 1, &loaded, sizeof(loaded), &bytes_read) == gbs::SaveStatus::Ok);
    assert(bytes_read == sizeof(second));
    assert(loaded.room == 2);
    assert(loaded.player_x == 32);

    assert(gbs::clear_save_slot(save_bank, 1) == gbs::SaveStatus::Ok);
    assert(gbs::count_valid_saves(save_bank) == 2);
    assert(gbs::find_latest_save_slot(save_bank) == 2);
}

void test_save_bank_record_metadata_roundtrip() {
    gbs::format_save_memory();
    TestSaveData data { 5, 120, 128, { 11, 0, 0, 0 } };
    gbs::SaveMetadata metadata = gbs::make_save_metadata("SLOT 2", 9000, 222, 5, 3);

    assert(gbs::write_save_slot_record(save_bank, 2, &data, sizeof(data), metadata, 44) == gbs::SaveStatus::Ok);
    assert(gbs::find_latest_save_slot(save_bank) == 2);

    gbs::SaveMetadataInfo info = gbs::inspect_save_slot_metadata(save_bank, 2);
    assert(info.status == gbs::SaveStatus::Ok);
    assert(info.payload_size == sizeof(data));
    assert(info.metadata.room_index == 5);
    assert(info.metadata.flags == 3);

    TestSaveData loaded {};
    gbs::SaveMetadata loaded_metadata {};
    assert(gbs::read_save_slot_record(save_bank, 2, &loaded, sizeof(loaded), &loaded_metadata) == gbs::SaveStatus::Ok);
    assert(loaded.room == 5);
    assert(loaded.player_x == 120);
    assert(loaded_metadata.timestamp == 222);
}

void test_save_bank_rejects_invalid_index_and_clear_bank() {
    gbs::format_save_memory();
    TestSaveData data { 1, 8, 16, { 0, 0, 0, 0 } };

    assert(gbs::write_save_slot(save_bank, 99, &data, sizeof(data), 1) == gbs::SaveStatus::InvalidSlot);
    assert(gbs::read_save_slot(save_bank, 99, &data, sizeof(data)) == gbs::SaveStatus::InvalidSlot);
    assert(gbs::clear_save_slot(save_bank, 99) == gbs::SaveStatus::InvalidSlot);
    assert(gbs::inspect_save_slot(save_bank, 99).status == gbs::SaveStatus::InvalidSlot);
    assert(gbs::inspect_save_slot_metadata(save_bank, 99).status == gbs::SaveStatus::InvalidSlot);
    assert(gbs::write_save_slot_record(save_bank, 99, &data, sizeof(data), gbs::make_save_metadata("BAD"), 1) == gbs::SaveStatus::InvalidSlot);
    assert(gbs::read_save_slot_record(save_bank, 99, &data, sizeof(data)) == gbs::SaveStatus::InvalidSlot);

    assert(gbs::write_save_slot(save_bank, 0, &data, sizeof(data), 1) == gbs::SaveStatus::Ok);
    assert(gbs::write_save_slot(save_bank, 1, &data, sizeof(data), 2) == gbs::SaveStatus::Ok);
    assert(gbs::clear_save_bank(save_bank) == gbs::SaveStatus::Ok);
    assert(gbs::count_valid_saves(save_bank) == 0);
    assert(gbs::find_latest_save_slot(save_bank) == -1);
}

void test_universal_save_envelope_roundtrips_common_and_runtime_payload() {
    struct RuntimePayload { int32_t velocity_x; int32_t velocity_y; };
    const RuntimePayload payload { 256, -512 };
    int32_t variables[16] = {};
    variables[3] = 77;
    int32_t inventory[gbs::universal_save_inventory_count] = {};
    inventory[2] = 5;
    int32_t equipped_items[gbs::universal_save_equipment_slot_count] = {};
    equipped_items[0] = 7;
    equipped_items[3] = 11;
    char text_variables[gbs::text_variable_count][gbs::text_variable_max_length + 1] = {};
    text_variables[0][0] = 'N';
    text_variables[0][1] = 'A';
    text_variables[0][2] = 'R';
    text_variables[0][3] = 'A';
    gbs::UniversalSaveData save_data {};

    assert(gbs::make_universal_save_data(
        save_data,
        gbs::UniversalSaveRuntime::Platformer,
        4,
        80,
        96,
        12,
        18,
        variables,
        16,
        inventory,
        gbs::universal_save_inventory_count,
        equipped_items,
        gbs::universal_save_equipment_slot_count,
        1234,
        9,
        &payload,
        sizeof(payload),
        text_variables,
        gbs::text_variable_count
    ));
    assert(gbs::is_valid_universal_save_data(save_data));
    save_data.runtime = gbs::UniversalSaveRuntime::DungeonCrawler;
    assert(gbs::is_valid_universal_save_data(save_data));
    save_data.runtime = gbs::UniversalSaveRuntime::Racing;
    assert(gbs::is_valid_universal_save_data(save_data));
    save_data.runtime = gbs::UniversalSaveRuntime::Platformer;
    assert(save_data.room_index == 4);
    assert(save_data.variables[3] == 77);
    assert(save_data.inventory[2] == 5);
    assert(save_data.equipped_items[0] == 7);
    assert(save_data.equipped_items[3] == 11);
    assert(save_data.text_variables[0][0] == 'N');
    assert(save_data.text_variables[0][3] == 'A');
    const gbs::SaveBank undersized_bank {
        4096,
        1024,
        1,
        gbs::make_save_signature('U', 'N', 'D', 'R'),
        1
    };
    const gbs::SaveBank supported_bank {
        8192,
        2048,
        1,
        gbs::make_save_signature('U', 'N', 'I', 'V'),
        1
    };
    const gbs::SaveMetadata metadata = gbs::make_save_metadata("UNIVERSAL");
    assert(gbs::write_save_slot_record(
        undersized_bank,
        0,
        &save_data,
        sizeof(save_data),
        metadata
    ) == gbs::SaveStatus::TooLarge);
    assert(gbs::write_save_slot_record(
        supported_bank,
        0,
        &save_data,
        sizeof(save_data),
        metadata
    ) == gbs::SaveStatus::Ok);

    int32_t restored_variables[gbs::universal_save_variable_count] = {};
    int32_t restored_inventory[gbs::universal_save_inventory_count] = {};
    int32_t restored_equipped_items[gbs::universal_save_equipment_slot_count] = {};
    char restored_text_variables[gbs::text_variable_count][gbs::text_variable_max_length + 1] = {};
    assert(gbs::read_universal_save_common_state(
        save_data,
        restored_variables,
        gbs::universal_save_variable_count,
        restored_inventory,
        gbs::universal_save_inventory_count,
        restored_equipped_items,
        gbs::universal_save_equipment_slot_count,
        restored_text_variables,
        gbs::text_variable_count
    ));
    assert(restored_variables[3] == 77);
    assert(restored_inventory[2] == 5);
    assert(restored_equipped_items[0] == 7);
    assert(restored_equipped_items[3] == 11);
    assert(restored_text_variables[0][0] == 'N');
    assert(restored_text_variables[0][3] == 'A');

    RuntimePayload loaded {};
    assert(gbs::read_universal_save_payload(save_data, gbs::UniversalSaveRuntime::Platformer, &loaded, sizeof(loaded)));
    assert(loaded.velocity_x == 256);
    assert(loaded.velocity_y == -512);
    assert(!gbs::read_universal_save_payload(save_data, gbs::UniversalSaveRuntime::Isometric, &loaded, sizeof(loaded)));

    save_data.payload_size = gbs::universal_save_payload_capacity + 1;
    assert(!gbs::is_valid_universal_save_data(save_data));
}

void test_universal_save_persists_dialogue_language() {
    gbs::configure_dialogue_locale_id(3);
    gbs::UniversalSaveData save_data {};
    assert(gbs::make_universal_save_data(
        save_data,
        gbs::UniversalSaveRuntime::TopDown,
        0, 0, 0, 0, 0,
        nullptr, 0, nullptr, 0, nullptr, 0,
        0, 0, nullptr, 0
    ));
    assert(save_data.dialogue_locale == 3);

    gbs::configure_dialogue_locale_id(2);
    assert(gbs::read_universal_save_common_state(save_data, nullptr, 0, nullptr, 0, nullptr, 0));
    assert(gbs::active_dialogue_locale_id() == 3);
}

void test_flash_protocol_sequences_are_explicit() {
    const gbs::FlashCommandSequence program = gbs::make_flash_program_sequence(0x1234u, 0x56u);
    assert(program.status == gbs::SaveStatus::Ok);
    assert(program.command_count == 4);
    assert(program.commands[0].address == 0x5555u && program.commands[0].value == 0xAAu);
    assert(program.commands[1].address == 0x2AAAu && program.commands[1].value == 0x55u);
    assert(program.commands[2].address == 0x5555u && program.commands[2].value == 0xA0u);
    assert(program.commands[3].address == 0x1234u && program.commands[3].value == 0x56u);

    const gbs::FlashCommandSequence erase = gbs::make_flash_sector_erase_sequence(0x4000u);
    assert(erase.status == gbs::SaveStatus::Ok);
    assert(erase.command_count == 6);
    assert(erase.commands[2].value == 0x80u);
    assert(erase.commands[5].address == 0x4000u && erase.commands[5].value == 0x30u);
    assert(gbs::make_flash_program_sequence(0x1234u, 0x100u).status == gbs::SaveStatus::InvalidData);
}

void test_eeprom_serial_frames_are_msb_first_and_bounded() {
    const gbs::EepromSerialFrame read = gbs::make_eeprom_read_frame(0x2Au, 6);
    assert(read.status == gbs::SaveStatus::Ok);
    assert(read.bit_count == 9);
    const uint8_t expected_read[] = { 1, 1, 1, 0, 1, 0, 1, 0, 0 };
    for (uint8_t index = 0; index < read.bit_count; ++index) {
        assert(read.bits[index] == expected_read[index]);
    }

    const uint8_t data[8] = { 0x80, 0x01, 0x7F, 0x00, 0xAA, 0x55, 0x12, 0x34 };
    const gbs::EepromSerialFrame write = gbs::make_eeprom_write_frame(0x12u, 6, data);
    assert(write.status == gbs::SaveStatus::Ok);
    assert(write.bit_count == 73);
    assert(write.bits[0] == 1 && write.bits[1] == 0);
    assert(write.bits[2] == 0 && write.bits[3] == 1 && write.bits[4] == 0 && write.bits[5] == 0 && write.bits[6] == 1 && write.bits[7] == 0);
    assert(write.bits[8] == 1 && write.bits[9] == 0 && write.bits[15] == 0);
    assert(write.bits[72] == 0);
    assert(gbs::make_eeprom_read_frame(0x40u, 6).status == gbs::SaveStatus::InvalidData);
    assert(gbs::make_eeprom_read_frame(0x12u, 8).status == gbs::SaveStatus::InvalidData);
    assert(gbs::make_eeprom_write_frame(0x12u, 6, nullptr).status == gbs::SaveStatus::InvalidData);
}

void test_unconfigured_save_backend_is_not_claimed_ready() {
    assert(gbs::configured_save_backend_status() == gbs::SaveStatus::Ok);
    assert(gbs::save_backend_status(gbs::CartridgeSaveDevice::Flash) == gbs::SaveStatus::Ok);
    assert(gbs::save_backend_status(gbs::CartridgeSaveDevice::Eeprom) == gbs::SaveStatus::UnsupportedDevice);
    assert(gbs::save_backend_status(gbs::CartridgeSaveDevice::Unknown) == gbs::SaveStatus::UnsupportedDevice);
}

void test_configured_flash_backend_uses_declared_geometry_and_operations() {
    static FakeCartridgeState state {};
    for (uint8_t& value : state.bytes) {
        value = 0xFFu;
    }
    state.erase_calls = 0;
    const gbs::SaveBackend flash_backend {
        gbs::CartridgeSaveDevice::Flash,
        sizeof(state.bytes),
        1,
        4096,
        &state,
        fake_cartridge_read,
        fake_cartridge_write,
        fake_cartridge_erase
    };
    assert(gbs::configure_save_backend(flash_backend));
    assert(gbs::configured_save_backend_status() == gbs::SaveStatus::Ok);
    assert(gbs::is_valid_save_slot_for_capacity(gbs::SaveSlot {
        32768,
        512,
        gbs::make_save_signature('F', 'L', 'S', 'H'),
        1
    }, sizeof(state.bytes)));

    const gbs::SaveSlot slot {
        32768,
        512,
        gbs::make_save_signature('F', 'L', 'S', 'H'),
        1
    };
    TestSaveData data { 9, 320, 336, { 2, 4, 6, 8 } };
    assert(gbs::write_save(slot, &data, sizeof(data), 8) == gbs::SaveStatus::Ok);
    assert(state.erase_calls == 1);
    TestSaveData loaded {};
    assert(gbs::read_save(slot, &loaded, sizeof(loaded)) == gbs::SaveStatus::Ok);
    assert(loaded.room == 9);
    assert(gbs::clear_save(slot) == gbs::SaveStatus::Ok);
    assert(gbs::inspect_save(slot).status == gbs::SaveStatus::NotFound);
    gbs::reset_save_backend();
}

void test_configured_eeprom_backend_requires_explicit_configuration() {
    static FakeCartridgeState state {};
    for (uint8_t& value : state.bytes) {
        value = 0xFFu;
    }
    const gbs::SaveBackend eeprom_backend {
        gbs::CartridgeSaveDevice::Eeprom,
        512,
        8,
        0,
        &state,
        fake_cartridge_read,
        fake_cartridge_write,
        fake_cartridge_erase
    };
    assert(gbs::configure_save_backend(eeprom_backend));
    assert(gbs::configured_save_backend_status() == gbs::SaveStatus::Ok);
    assert(!gbs::is_valid_save_slot_for_capacity(gbs::SaveSlot {
        0,
        512,
        gbs::make_save_signature('E', 'E', 'P', 'R'),
        1
    }, 256));
    const gbs::SaveSlot slot {
        0,
        128,
        gbs::make_save_signature('E', 'E', 'P', 'R'),
        1
    };
    const uint8_t payload[] = { 1, 3, 3, 7 };
    assert(gbs::write_save(slot, payload, sizeof(payload), 3) == gbs::SaveStatus::Ok);
    uint8_t loaded[sizeof(payload)] = {};
    assert(gbs::read_save(slot, loaded, sizeof(loaded)) == gbs::SaveStatus::Ok);
    assert(loaded[3] == 7);
    gbs::reset_save_backend();
}

} // namespace

int main() {
    test_flash1m_backend_probes_and_keeps_save_slots_in_separate_sectors();
    test_save_slot_validation();
    test_write_inspect_and_read_save();
    test_read_rejects_small_destination();
    test_version_mismatch_and_clear();
    test_capacity_and_null_validation();
    test_save_record_metadata_roundtrip();
    test_format_save_play_time();
    test_save_record_rejects_raw_save_and_small_destination();
    test_save_bank_write_read_and_latest_slot();
    test_save_bank_record_metadata_roundtrip();
    test_save_bank_rejects_invalid_index_and_clear_bank();
    test_universal_save_envelope_roundtrips_common_and_runtime_payload();
    test_universal_save_persists_dialogue_language();
    test_flash_protocol_sequences_are_explicit();
    test_eeprom_serial_frames_are_msb_first_and_bounded();
    test_unconfigured_save_backend_is_not_claimed_ready();
    test_configured_flash_backend_uses_declared_geometry_and_operations();
    test_configured_eeprom_backend_requires_explicit_configuration();
    return 0;
}
