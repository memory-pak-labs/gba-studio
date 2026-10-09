#include <cassert>
#include "gbs/audio_engine.hpp"

using namespace gbs;

void test_engine_init() {
    AudioEngineState engine = {};
    audio_engine_init(engine);
    assert(!engine.playing);
    assert(engine.frame_count == 0);
    assert(engine.master_volume == 80);
}

void test_updates_and_stops() {
    AudioEngineState engine = {};
    audio_engine_init(engine);
    audio_engine_update(engine);
    assert(engine.frame_count == 1);
    audio_engine_update(engine);
    assert(engine.frame_count == 2);
}

void test_master_volume() {
    AudioEngineState engine = {};
    audio_engine_init(engine);
    audio_engine_set_master_volume(engine, 75);
    assert(engine.master_volume == 75);

    audio_engine_set_master_volume(engine, 150);
    assert(engine.master_volume == 100);
    assert(audio_engine_get_master_volume(engine) == 100);
}

int main() {
    test_engine_init();
    test_updates_and_stops();
    test_master_volume();
    return 0;
}