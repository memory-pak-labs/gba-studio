#include <cassert>
#include <cstdint>
#include <cstring>
#include <initializer_list>
#include "gbs/hud_gauge.hpp"

// Independent pixel oracle, including borders, unaligned nibble edges,
// multi-part layouts, tile gaps, clipping and both fill directions.
void reference(const gbs::MetaSprite& sprite, const gbs::HudGauge& gauge,
               uint32_t value, uint32_t maximum, uint8_t* output) {
    std::memcpy(output, gauge.full->data, gauge.full->tile_count * 32u);
    const unsigned filled = maximum ? uint64_t(value < maximum ? value : maximum) * gauge.width / maximum : 0;
    for (size_t n = 0; n < sprite.part_count; ++n) {
        const auto& part = sprite.parts[n];
        for (unsigned y = 0; y < part.height; ++y) {
            for (unsigned x = 0; x < part.width; ++x) {
                const int world_x = part.x + static_cast<int>(x);
                const int world_y = part.y + static_cast<int>(y);
                if (world_x < gauge.x || world_y < gauge.y ||
                    world_x >= gauge.x + gauge.width || world_y >= gauge.y + gauge.height) continue;
                const unsigned relative = world_x - gauge.x;
                if (gauge.reverse ? relative >= gauge.width - filled : relative < filled) continue;
                const size_t tile = part.tile_index - gauge.full->destination_tile +
                    (y / 8) * (part.width / 8) + x / 8;
                const size_t offset = tile * 32 + (y % 8) * 4 + (x % 8) / 2;
                const unsigned shift = (x & 1) * 4;
                output[offset] = (output[offset] & ~(15u << shift)) |
                    (gauge.empty->data[offset] & (15u << shift));
            }
        }
    }
}

int main() {
    uint8_t full[1536], empty[1536], output[1536], expected[1536];
    for (size_t i = 0; i < sizeof(full); ++i) {
        full[i] = static_cast<uint8_t>(i * 17 + 123);
        empty[i] = static_cast<uint8_t>(i * 31 + 47);
    }
    const gbs::TileAsset filled {full,48,20,true}, blank {empty,48,72,true};
    const gbs::MetaSpritePart layouts[][3] = {
        {{0,0,20,0,0,0,32,32},{32,0,36,0,0,0,32,32},{64,0,52,0,0,0,32,32}},
        {{-7,-2,44,0,0,0,16,16},{17,3,20,0,0,0,32,8},{49,0,28,0,0,0,8,32}}
    };
    const uint32_t maxima[] = {0,1,100,999,0xffffffffu};
    const uint32_t values[] = {0,1,49,50,51,99,100,999,0xffffffffu};
    for (const auto& parts : layouts) {
        const gbs::MetaSprite sprite {parts,3};
        for (unsigned x = 0; x <= 7; ++x) for (unsigned width : {1u,6u,17u,86u})
            for (bool reversed : {false,true}) for (auto maximum : maxima) for (auto value : values) {
                const gbs::HudGauge gauge {&filled,&blank,static_cast<uint8_t>(x),5,
                    static_cast<uint8_t>(width),6,reversed};
                reference(sprite,gauge,value,maximum,expected);
                assert(gbs::compose_hud_gauge(sprite,gauge,value,maximum,output,sizeof(output)));
                assert(std::memcmp(output,expected,sizeof(output)) == 0);
            }
    }
}
