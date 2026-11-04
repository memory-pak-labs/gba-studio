#include <cassert>
#include "gbs/scene_script_runner.hpp"
#include "gbs/iso_event_scheduler.hpp"

int main() {
    {
        gbs::EventState events {}; gbs::init_event_state(events);
        gbs::IsoEventScheduler scheduler {};
        const gbs::EventCommand script[] = {
            {gbs::EventOp::SetBackgroundScale,2,512,256,4},
            {gbs::EventOp::Wait,6,0,0},
            {gbs::EventOp::SetBackgroundScale,2,256,256,0},
            {gbs::EventOp::SetVariable,0,1,0}, {gbs::EventOp::End,0,0,0}
        };
        assert(gbs::run_iso_scheduled_script(scheduler,events,{script,5}));
        assert(events.variables[0] == 0);
        for (int frame=0;frame<8;++frame) {
            gbs::tick_event_frame_counter(events);
            gbs::tick_iso_event_scheduler(scheduler,events,false);
        }
        assert(events.variables[0] == 1 && events.background_scales[0].x256 == 256);
    }
    gbs::EventState events {}; gbs::init_event_state(events);
    gbs::SceneScriptRunner sequence {}; gbs::init_scene_script_runner(sequence);
    const gbs::EventCommand commands[] = {
        {gbs::EventOp::SetBackgroundScale,2,512,256,4},
        {gbs::EventOp::Wait,6,0,0},
        {gbs::EventOp::SetBackgroundScale,2,256,256,0},
        {gbs::EventOp::SetVariable,0,1,0}, {gbs::EventOp::End,0,0,0}
    };
    const gbs::EventCommand focus[] = {{gbs::EventOp::SetVariable,1,2,0}, {gbs::EventOp::End,0,0,0}};
    assert(gbs::enqueue_scene_script(sequence,{commands,5}));
    assert(gbs::enqueue_scene_script(sequence,{focus,2}));
    gbs::tick_scene_script_runner(sequence,events,false,nullptr,nullptr);
    assert(events.variables[0] == 0 && events.variables[1] == 0);
    for (int frame=0;frame<4;++frame) {
        gbs::tick_event_frame_counter(events);
        gbs::tick_scene_script_runner(sequence,events,false,nullptr,nullptr);
        assert(events.variables[0] == 0 && events.variables[1] == 0);
    }
    assert(events.background_scales[0].x256 == 512);
    // Dialogue pauses the script, while the visual state remains available to render.
    gbs::tick_scene_script_runner(sequence,events,true,nullptr,nullptr);
    assert(events.variables[0] == 0 && events.background_scales[0].x256 == 512);
    for(int i=0;i<2;++i) gbs::tick_scene_script_runner(sequence,events,false,nullptr,nullptr);
    assert(events.variables[0] == 1 && events.background_scales[0].x256 == 256);
    assert(events.variables[1] == 0);
    gbs::tick_scene_script_runner(sequence,events,false,nullptr,nullptr);
    assert(events.variables[1] == 2 && !gbs::scene_script_runner_active(sequence));
}
