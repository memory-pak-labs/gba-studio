#pragma once
#include "gbs/platformer.hpp"
namespace gbs {
struct PlatformerMotionCatalog {const PlatformerProjectData* project;int room;};
inline EventScript platformer_motion_catalog_lookup(const PlatformerMotionCatalog& catalog,int32_t wanted,EventScript match,int32_t* found){
 if(found)*found=-1;if(!catalog.project || !is_valid_platformer_room_index(*catalog.project,catalog.room))return empty_event_script();
 const auto& project=*catalog.project;const auto& room=project.rooms[catalog.room];int32_t id=0;EventScript result=empty_event_script();
 auto visit=[&](EventScript script){if(wanted==id)result=script;if(found&&*found<0&&has_event_script(match)&&script.commands==match.commands&&script.command_count==match.command_count)*found=id;++id;};
 visit(room.on_enter);visit(room.on_exit);visit(room.on_update);visit(room.on_restore);visit(room.on_hit_group1);visit(room.on_hit_group2);visit(room.on_hit_group3);
 visit(project.player_on_start);visit(project.player_on_update);
 for(size_t i=0;room.npcs&&i<room.npc_count;++i){visit(room.npcs[i].on_interact);visit(room.npcs[i].on_start);visit(room.npcs[i].on_update);}
 for(size_t i=0;room.hazard_events&&i<room.hazard_event_count;++i)visit(room.hazard_events[i].script);
 for(size_t i=0;room.checkpoint_events&&i<room.checkpoint_event_count;++i)visit(room.checkpoint_events[i].script);
 for(size_t i=0;room.camera_zone_events&&i<room.camera_zone_event_count;++i)visit(room.camera_zone_events[i].script);
 for(size_t i=0;room.enemy_events&&i<room.enemy_event_count;++i)visit(room.enemy_events[i].script);
 for(size_t i=0;room.moving_platform_events&&i<room.moving_platform_event_count;++i)visit(room.moving_platform_events[i].script);
 for(size_t i=0;room.triggers&&i<room.trigger_count;++i){visit(room.triggers[i].on_enter);visit(room.triggers[i].on_leave);}
 for(size_t i=0;project.scripts&&i<project.script_count;++i)visit(project.scripts[i]);return result;
}
inline int32_t platformer_motion_identify(EventScript script,void* opaque){int32_t id=-1;platformer_motion_catalog_lookup(*static_cast<PlatformerMotionCatalog*>(opaque),-1,script,&id);return id;}
inline EventScript platformer_motion_resolve(int32_t id,void* opaque){return platformer_motion_catalog_lookup(*static_cast<PlatformerMotionCatalog*>(opaque),id,empty_event_script(),nullptr);}
}
