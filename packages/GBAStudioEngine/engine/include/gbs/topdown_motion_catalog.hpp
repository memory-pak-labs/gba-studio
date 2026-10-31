#pragma once
#include "gbs/project.hpp"

namespace gbs {
// Stable ordinal catalog of authored scripts. Both lookup directions traverse
// the same contract; content hashes in the checkpoint detect changed scripts.
struct TopDownMotionCatalog { const TopDownProjectData* project; int room; };
inline EventScript topdown_motion_catalog_lookup(const TopDownMotionCatalog& catalog, int32_t wanted,
    EventScript match, int32_t* found) {
    if(found)*found=-1;
    if(!catalog.project || !is_valid_room_index(*catalog.project,catalog.room)) return empty_event_script();
    const auto& project=*catalog.project; const auto& room=project.rooms[catalog.room];int32_t id=0;
    EventScript result=empty_event_script();
    auto visit=[&](EventScript script) {
        if(wanted==id) result=script;
        if(found && *found<0 && has_event_script(match) && script.commands==match.commands && script.command_count==match.command_count) *found=id;
        ++id;
    };
    visit(room.on_enter);visit(room.on_exit);visit(room.on_interact);visit(room.on_restore);
    visit(room.on_hit_group1);visit(room.on_hit_group2);visit(room.on_hit_group3);
    visit(project.player.on_start);visit(project.player.on_update);visit(project.player.on_hit_actor);visit(project.player.on_hit_player);
    visit(project.player.on_hit_group1);visit(project.player.on_hit_group2);visit(project.player.on_hit_group3);visit(project.player.on_defeated);
    for(size_t i=0;room.npcs && i<room.npc_count;++i) {
        const auto& npc=room.npcs[i];visit(npc.on_interact);visit(npc.on_start);visit(npc.on_update);visit(npc.on_hit_actor);visit(npc.on_hit_player);
        visit(npc.on_hit_group1);visit(npc.on_hit_group2);visit(npc.on_hit_group3);visit(npc.on_defeated);
    }
    for(size_t i=0;room.portal_events && i<room.portal_event_count;++i) visit(room.portal_events[i].script);
    for(size_t i=0;room.interactions && i<room.interaction_count;++i) visit(room.interactions[i].script);
    for(size_t i=0;room.triggers && i<room.trigger_count;++i) {visit(room.triggers[i].on_enter);visit(room.triggers[i].on_leave);visit(room.triggers[i].condition);}
    for(size_t i=0;room.tile_effect_events && i<room.tile_effect_event_count;++i) {visit(room.tile_effect_events[i].on_enter);visit(room.tile_effect_events[i].on_leave);}
    for(size_t i=0;project.scripts && i<project.script_count;++i) visit(project.scripts[i]);
    for(size_t i=0;project.named_scripts && i<project.named_script_count;++i) visit(project.named_scripts[i].script);
    for(size_t i=0;project.quests && i<project.quest_count;++i) visit(project.quests[i].on_complete);
    for(size_t i=0;project.shop_items && i<project.shop_item_count;++i) visit(project.shop_items[i].on_purchase);
    return result;
}
inline int32_t topdown_motion_identify(EventScript script, void* context) {
    int32_t found=-1;topdown_motion_catalog_lookup(*static_cast<TopDownMotionCatalog*>(context),-1,script,&found);return found;
}
inline EventScript topdown_motion_resolve(int32_t id, void* context) {
    return topdown_motion_catalog_lookup(*static_cast<TopDownMotionCatalog*>(context),id,empty_event_script(),nullptr);
}
}
