#pragma once

#include "gbs/save.hpp"
#include "gbs/shmup.hpp"

namespace gbastudio_shmup_project {

constexpr bool save_enabled = true;
constexpr gbs::SaveBank save_bank {
    0,
    1024,
    1,
    gbs::make_save_signature('G', 'B', 'S', 'H'),
    1
};

constexpr gbs::DialogueLine dialogue_lines[] = {
    { "Wave inicial." },
    { "Inimigo destruido." },
};

constexpr gbs::EventCommand wave_start_commands[] = {
    { gbs::EventOp::ShowDialogue, 0, 0, 0 },
};

constexpr gbs::EventCommand enemy_destroy_commands[] = {
    { gbs::EventOp::SetVariable, 0, 1, 0 },
    { gbs::EventOp::ShowDialogue, 1, 0, 0 },
};

constexpr gbs::ShmupEnemyData wave_0_enemies[] = {
    {
        "scout_left",
        { 40, 16 },
        { 16, 16 },
        { 0, 1 },
        gbs::ShmupEnemyMovementKind::Linear,
        1,
        100,
        32,
        { 6, 12 },
        -1,
        gbs::empty_event_script(),
        { enemy_destroy_commands, sizeof(enemy_destroy_commands) / sizeof(enemy_destroy_commands[0]) },
        gbs::empty_event_script(),
        nullptr
    },
    {
        "scout_right",
        { 160, 24 },
        { 16, 16 },
        { -1, 1 },
        gbs::ShmupEnemyMovementKind::Dive,
        2,
        150,
        45,
        { 6, 12 },
        -1,
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        nullptr
    },
};

constexpr gbs::ShmupWaveData waves[] = {
    {
        "wave_0",
        wave_0_enemies,
        sizeof(wave_0_enemies) / sizeof(wave_0_enemies[0]),
        0,
        -1,
        { wave_start_commands, sizeof(wave_start_commands) / sizeof(wave_start_commands[0]) },
        gbs::empty_event_script(),
        nullptr
    },
};

constexpr size_t max_enemy_count = sizeof(wave_0_enemies) / sizeof(wave_0_enemies[0]);

constexpr const gbs::ResourceBankUploadSource* resource_bank_upload_sources = nullptr;
constexpr size_t resource_bank_upload_source_count = 0;

constexpr gbs::ShmupProjectData project = {
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    -1,
    {
        { 112, 128 },
        { 16, 16 },
        2,
        10,
        { 6, -4 },
        gbs::empty_event_script(),
        nullptr
    },
    {
        { 4, 8 },
        { 0, -4 },
        6,
        gbs::empty_event_script()
    },
    {
        { 4, 8 },
        { 0, 2 },
        8,
        gbs::empty_event_script()
    },
    waves,
    sizeof(waves) / sizeof(waves[0]),
    0,
    dialogue_lines,
    sizeof(dialogue_lines) / sizeof(dialogue_lines[0]),
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0
};

} // namespace gbastudio_shmup_project
