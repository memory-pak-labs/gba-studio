#include <cassert>
#include <cstdio>
#include <cstring>
#include <vector>
#include "gbs/isometric_paged_surface.hpp"
int main() {
    std::vector<uint8_t> tiles(1581*64);
    for (int i=0;i<1515;++i) for(int p=0;p<64;++p) tiles[i*64+p]=(i+p)%164;
    std::vector<uint16_t> back(64*43), front(64*43);
    for(int i=0;i<64*43;++i){back[i]=i%1515;front[i]=1515+i%66;}
    gbs::IsoBakedComposition surface {tiles.data(),1581,back.data(),front.data(),64,43,{0,0},nullptr,1515};
    gbs::PagedBackgroundWindow window;
    uint8_t cache[651*64]={};uint16_t bg[1024]={},fg[1024]={};
    int cameras=0,uploaded=0;
    auto verify=[&](int cx,int cy){
        assert(gbs::update_iso_paged_surface(surface,window,cx,cy,bg,fg,[&](int slot,const uint8_t* data){
            assert(slot>=0&&slot<651);memcpy(cache+slot*64,data,64);++uploaded;
        }));
        for(int y=0;y<160;++y)for(int x=0;x<240;++x){
            const int wx=x+cx,wy=y+cy,pos=((wy/8)%32)*32+(wx/8)%32,pixel=(wy%8)*8+wx%8;
            const int source=(wy/8)*64+wx/8;
            assert(cache[bg[pos]*64+pixel]==tiles[back[source]*64+pixel]);
            assert(fg[pos]==651+front[source]-1515);
        }
        ++cameras;
    };
    for(int y=0;y<=184;y+=8)for(int x=0;x<=272;x+=8){verify(x,y);verify(x<265?x+7:272,y<177?y+7:184);}
    verify(272,0);verify(0,184);verify(96,40);verify(0,0);
    const int previous=uploaded;verify(1,1);assert(uploaded==previous);
    assert(!gbs::update_iso_paged_surface(surface,window,-1,0,bg,fg,[](int,const uint8_t*){}));
    surface.paged_foreground_first_tile=1400;
    assert(!gbs::update_iso_paged_surface(surface,window,0,0,bg,fg,[](int,const uint8_t*){}));
    printf("%d camera positions; background pixels and foreground indices agree; %d uploads\n",cameras,uploaded);
}
