#include <cassert>
#include <cstring>
#include "gbs/typewriter.hpp"

using namespace gbs;

void test_instant_reveal() {
    TypewriterState state;
    typewriter_start(state, "hello", 0, 0);  // chars_per_second=0 => instant
    assert(typewriter_is_done(state));
    assert(typewriter_revealed_count(state) == 5);
    assert(strcmp(typewriter_text(state), "hello") == 0);
}

void test_reveal_over_frames() {
    TypewriterState state;
    typewriter_start(state, "hello", 60, 0);  // 60 chars/sec => 1 char per frame

    // Nothing revealed yet (update hasn't run)
    assert(typewriter_revealed_count(state) == 0);
    assert(!typewriter_is_done(state));

    for (int i = 0; i < 5; ++i) {
        typewriter_update(state);
    }
    // 60 cps with 60 fps => 1 char per frame => 5 chars after 5 frames
    assert(typewriter_revealed_count(state) == 5);
    assert(typewriter_is_done(state));
    assert(strcmp(typewriter_text(state), "hello") == 0);
}

void test_delay_then_reveal() {
    TypewriterState state;
    typewriter_start(state, "ab", 60, 3);  // 3-frame initial delay

    for (int i = 0; i < 3; ++i) {
        typewriter_update(state);  // delay consumed, nothing revealed
    }
    assert(typewriter_revealed_count(state) == 0);

    typewriter_update(state);  // frame 4: reveal 'a'
    assert(typewriter_revealed_count(state) == 1);
    assert(strcmp(typewriter_text(state), "a") == 0);
}

void test_skip() {
    TypewriterState state;
    typewriter_start(state, "hello world", 10, 5);
    assert(!typewriter_is_done(state));

    typewriter_skip(state);
    assert(typewriter_is_done(state));
    assert(typewriter_revealed_count(state) == 11);
    assert(strcmp(typewriter_text(state), "hello world") == 0);
}

void test_pause() {
    TypewriterState state;
    typewriter_start(state, "abcd", 60, 0);

    typewriter_update(state);  // reveal 'a'
    assert(typewriter_revealed_count(state) == 1);

    typewriter_set_paused(state, true);
    typewriter_update(state);
    typewriter_update(state);
    assert(typewriter_revealed_count(state) == 1);  // paused, no progress

    typewriter_set_paused(state, false);
    typewriter_update(state);  // reveal 'b'
    assert(typewriter_revealed_count(state) == 2);
}

void test_unicode_reveal() {
    TypewriterState state;
    // 3 ASCII + 1 é (2-byte UTF-8) => 4 codepoints
    typewriter_start(state, "a b\xC3\xA9", 60, 0);
    assert(typewriter_revealed_count(state) == 0);
    assert(typewriter_source_length("a b\xC3\xA9") == 4);

    typewriter_update(state);  // 'a'
    typewriter_update(state);  // ' '
    typewriter_update(state);  // 'b'
    assert(strcmp(typewriter_text(state), "a b") == 0);

    typewriter_update(state);  // 'é' (2 bytes)
    assert(typewriter_revealed_count(state) == 4);
    assert(typewriter_is_done(state));
    assert(strcmp(typewriter_text(state), "a b\xC3\xA9") == 0);
}

int main() {
    test_instant_reveal();
    test_reveal_over_frames();
    test_delay_then_reveal();
    test_skip();
    test_pause();
    test_unicode_reveal();
    return 0;
}
