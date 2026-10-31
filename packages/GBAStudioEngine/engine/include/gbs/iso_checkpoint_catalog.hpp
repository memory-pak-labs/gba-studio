#pragma once
#include "gbs/isometric.hpp"

namespace gbs {
// Experimental stable identifiers for scripts belonging to an isometric scene.
// No ROM pointer is written to a save; the checkpoint additionally verifies hash.
enum class IsoCheckpointScriptKind : uint8_t {
    Enter=1, Exit=2, Update=3, Restore=4, Hit1=5, Hit2=6, Hit3=7,
    ActorInteract=8, ActorStart=9, ActorUpdate=10, Tile=11,
    TriggerEnter=12, TriggerLeave=13, Project=14
};
inline int32_t iso_checkpoint_script_id(IsoCheckpointScriptKind kind, size_t index = 0) {
    return (static_cast<int32_t>(kind) << 24) | static_cast<int32_t>(index);
}
inline EventScript iso_checkpoint_script_at(const IsometricProjectData& project, int room_index, int32_t id) {
    if (!is_valid_isometric_room_index(project, room_index) || id < 0) return empty_event_script();
    const auto& room = project.rooms[room_index];
    const auto kind = static_cast<IsoCheckpointScriptKind>(static_cast<uint32_t>(id) >> 24);
    const size_t index = static_cast<uint32_t>(id) & 0x00ffffffu;
    switch (kind) {
    case IsoCheckpointScriptKind::Enter: return index == 0 ? room.on_enter : empty_event_script();
    case IsoCheckpointScriptKind::Exit: return index == 0 ? room.on_exit : empty_event_script();
    case IsoCheckpointScriptKind::Update: return index == 0 ? room.on_update : empty_event_script();
    case IsoCheckpointScriptKind::Restore: return index == 0 ? room.on_restore : empty_event_script();
    case IsoCheckpointScriptKind::Hit1: return index == 0 ? room.on_hit_group1 : empty_event_script();
    case IsoCheckpointScriptKind::Hit2: return index == 0 ? room.on_hit_group2 : empty_event_script();
    case IsoCheckpointScriptKind::Hit3: return index == 0 ? room.on_hit_group3 : empty_event_script();
    case IsoCheckpointScriptKind::ActorInteract:
        return room.actor_interact_events && index < room.actor_interact_event_count ? room.actor_interact_events[index].script : empty_event_script();
    case IsoCheckpointScriptKind::ActorStart:
        return room.actor_start_events && index < room.actor_start_event_count ? room.actor_start_events[index].script : empty_event_script();
    case IsoCheckpointScriptKind::ActorUpdate:
        return room.actor_update_events && index < room.actor_update_event_count ? room.actor_update_events[index].script : empty_event_script();
    case IsoCheckpointScriptKind::Tile:
        return room.tile_events && index < room.tile_event_count ? room.tile_events[index].script : empty_event_script();
    case IsoCheckpointScriptKind::TriggerEnter:
        return room.triggers && index < room.trigger_count ? room.triggers[index].on_enter : empty_event_script();
    case IsoCheckpointScriptKind::TriggerLeave:
        return room.triggers && index < room.trigger_count ? room.triggers[index].on_leave : empty_event_script();
    case IsoCheckpointScriptKind::Project:
        return project.scripts && index < project.script_count ? project.scripts[index] : empty_event_script();
    }
    return empty_event_script();
}
inline bool iso_checkpoint_find_script(const IsometricProjectData& project, int room_index, EventScript script, int32_t& id) {
    id = -1;
    if (!has_event_script(script) || !is_valid_isometric_room_index(project, room_index)) return false;
    const auto& room = project.rooms[room_index];
    const size_t counts[] = {0,1,1,1,1,1,1,1,room.actor_interact_event_count,room.actor_start_event_count,
        room.actor_update_event_count,room.tile_event_count,room.trigger_count,room.trigger_count,project.script_count};
    for (int kind = 1; kind <= 14; ++kind) {
        for (size_t index = 0; index < counts[kind] && index <= 0x00ffffffu; ++index) {
            const int32_t candidate = iso_checkpoint_script_id(static_cast<IsoCheckpointScriptKind>(kind), index);
            const auto current = iso_checkpoint_script_at(project, room_index, candidate);
            if (current.commands == script.commands && current.command_count == script.command_count) {
                id = candidate; return true;
            }
        }
    }
    return false;
}
}
