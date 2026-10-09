#include "gbs/random.hpp"

namespace gbs {

void seed_random(RandomState& random, uint32_t seed) {
    random.state = seed == 0 ? 1u : seed;
}

uint32_t next_random(RandomState& random) {
    random.state = random.state * 1103515245u + 12345u;
    return random.state;
}

uint32_t random_bounded(RandomState& random, uint32_t exclusive_maximum) {
    if (exclusive_maximum == 0) {
        return 0;
    }
    return (next_random(random) >> 16u) % exclusive_maximum;
}

int32_t random_range(RandomState& random, int32_t minimum, int32_t maximum) {
    if (minimum > maximum) {
        const int32_t swap = minimum;
        minimum = maximum;
        maximum = swap;
    }
    const uint64_t span = static_cast<uint64_t>(static_cast<int64_t>(maximum) - minimum) + 1u;
    const uint32_t bounded_span = span > 0xFFFFFFFFu ? 0xFFFFFFFFu : static_cast<uint32_t>(span);
    return minimum + static_cast<int32_t>(random_bounded(random, bounded_span));
}

} // namespace gbs
