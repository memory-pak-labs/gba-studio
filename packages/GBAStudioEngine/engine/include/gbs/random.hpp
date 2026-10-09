#pragma once

#include <stdint.h>

namespace gbs {

struct RandomState {
    uint32_t state = 1;
};

void seed_random(RandomState& random, uint32_t seed);
uint32_t next_random(RandomState& random);
uint32_t random_bounded(RandomState& random, uint32_t exclusive_maximum);
int32_t random_range(RandomState& random, int32_t minimum, int32_t maximum);

} // namespace gbs
