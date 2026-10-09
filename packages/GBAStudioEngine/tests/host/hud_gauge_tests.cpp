#include <cassert>
#include <cstring>
#include "gbs/hud_gauge.hpp"
int main() {
    uint8_t full[32], empty[32], output[32];
    std::memset(full,0x77,32); std::memset(empty,0x11,32);
    const gbs::MetaSpritePart part {0,0,20,0,0,0,8,8};
    const gbs::MetaSprite sprite {&part,1};
    const gbs::TileAsset filled {full,1,20,true}, blank {empty,1,24,true};
    const gbs::HudGauge gauge {&filled,&blank,2,2,4,4,false};
    assert(gbs::compose_hud_gauge(sprite,gauge,50,100,output,sizeof(output)));
    assert(output[0]==0x77); // border unchanged
    assert(output[9]==0x77 && output[10]==0x11); // left half, exact pixels
    auto reversed=gauge; reversed.reverse=true;
    assert(gbs::compose_hud_gauge(sprite,reversed,50,100,output,sizeof(output)));
    assert(output[9]==0x11 && output[10]==0x77);
    assert(gbs::compose_hud_gauge(sprite,gauge,200,100,output,sizeof(output)));
    assert(output[9]==0x77 && output[10]==0x77);
    assert(gbs::compose_hud_gauge(sprite,gauge,99,0,output,sizeof(output)));
    assert(output[9]==0x11 && output[10]==0x11);
    assert(!gbs::compose_hud_gauge(sprite,gauge,50,100,output,1));
    auto compressed=gauge; auto compressedTiles=filled;
    compressedTiles.compression=gbs::AssetCompression::Lz77; compressed.full=&compressedTiles;
    assert(!gbs::compose_hud_gauge(sprite,compressed,50,100,output,sizeof(output)));
}
