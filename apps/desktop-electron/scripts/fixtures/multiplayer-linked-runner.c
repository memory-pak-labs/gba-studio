/* Native linked-core QA. Lockstep coordination adapted from mGBA 0.10.5
 * src/platform/qt/MultiplayerController.cpp, Copyright 2013-2015 Jeffrey Pfau.
 * This file is subject to the Mozilla Public License, v. 2.0:
 * https://mozilla.org/MPL/2.0/ . The emulated SIO and ARM execution are upstream.
 */
#include <mgba/core/core.h>
#include <mgba/core/lockstep.h>
#include <mgba/core/config.h>
#include <mgba/core/log.h>
#include <mgba/gba/core.h>
#include <mgba/internal/gba/gba.h>
#include <mgba/internal/gba/sio.h>
#include <mgba/internal/gba/sio/lockstep.h>
#include <mgba-util/vfs.h>
#include <stdio.h>
#include <fcntl.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
struct Peer {
    struct mCore* core;
    struct GBASIOLockstepNode node;
    int awake, credit;
    unsigned wait;
};
struct Host {
    struct GBASIOLockstep cable;
    struct Peer p[4];
    int count;
};
static struct Host* host(struct mLockstep* l){
    return l->context;
}

static struct Peer* peer(struct Host* h,int id){
    for(int i=0;i<h->count;++i)if(h->p[i].node.id==id)return &h->p[i];
    abort();
}

static bool signal_(struct mLockstep* l,unsigned mask){
    struct Peer*p=peer(host(l),0);
    p->wait&=~mask;
    if(!p->wait&&!p->awake){
        p->awake=1;
        return true;
    }
    return false;
}

static bool wait_(struct mLockstep*l,unsigned mask){
    struct Peer*p=peer(host(l),0);
    p->wait|=mask;
    bool slept=p->awake;
    p->awake=0;
    return slept;
}

static void add_(struct mLockstep*l,int id,int32_t c){
    struct Host*h=host(l);
    if(c<0)abort();
    if(id){
        peer(h,id)->credit+=c;
        return;
    }
    for(int i=1;i<l->attached;++i){
        struct Peer*p=peer(h,i);
        if(p->node.d.p->mode>SIO_MULTI)continue;
        p->credit+=c;
        if(!p->awake)p->node.nextEvent+=p->credit;
        p->awake=1;
    }
}

static int32_t use_(struct mLockstep*l,int id,int32_t c){
    struct Peer*p=peer(host(l),id);
    p->credit-=c;
    if(p->credit<=0)p->awake=0;
    return p->credit;
}

static int32_t unused_(struct mLockstep*l,int id){
    return peer(host(l),id)->credit;
}

static void unload_(struct mLockstep*l,int id){
    struct Host*h=host(l);
    if(id){
        struct Peer*p=peer(h,id);
        p->credit=0;
        p->awake=1;
        signal_(l,1u<<id);
    }
    else for(int i=1;i<l->attached;++i){
        struct Peer*p=peer(h,i);
        p->credit+=h->cable.players[0]->eventDiff;
        if(!p->awake)p->node.nextEvent+=p->credit;
        p->awake=1;
    }
}

static uint32_t read_(struct Peer*p,uint32_t a){
    return p->core->busRead32(p->core,a);
}

static void quiet(struct mLogger*l,int c,enum mLogLevel level,const char*format,va_list args){
    (void)l;
    (void)c;
    (void)level;
    (void)format;
    (void)args;
}

int main(int argc,char**argv){
    if(argc!=7)return 2;
    struct mLogger logger={
        .log=quiet
    };
    mLogSetDefaultLogger(&logger);
    struct Host h={
        0
    };
    h.count=atoi(argv[1]);
    uint32_t address=strtoul(argv[3],0,16);
    unsigned frames=atoi(argv[4]);
    int fault=atoi(argv[5]),schedule=atoi(argv[6]);
    mLockstepInit(&h.cable.d);
    GBASIOLockstepInit(&h.cable);
    h.cable.d.context=&h;
    h.cable.d.signal=signal_;
    h.cable.d.wait=wait_;
    h.cable.d.addCycles=add_;
    h.cable.d.useCycles=use_;
    h.cable.d.unusedCycles=unused_;
    h.cable.d.unload=unload_;
    for(int i=0;i<h.count;++i){
        struct Peer*p=&h.p[i];
        p->awake=1;
        p->core=GBACoreCreate();
        if(!p->core->init(p->core))return 3;
        mCoreConfigInit(&p->core->config,NULL);
        mCoreConfigSetDefaultIntValue(&p->core->config,"skipBios",1);
        mCoreLoadConfig(p->core);
        if(!p->core->loadROM(p->core,VFileOpen(argv[2],O_RDONLY)))return 4;
        p->core->reset(p->core);
        GBASIOLockstepNodeCreate(&p->node);
        if(!GBASIOLockstepAttachNode(&h.cable,&p->node))return 5;
        GBASIOSetDriver(&((struct GBA*)p->core->board)->sio,&p->node.d,SIO_MULTI);
    }
    int detached=0,reconnected=0;
    unsigned stable[4]={
        0
    },closing[4]={
        0
    };
    int phase=0;
    unsigned long iterations=0;
    for(;;){
        unsigned f=h.p[0].core->frameCounter(h.p[0].core);
        struct Peer*last=&h.p[h.count-1];
        struct GBASIO*sio=&((struct GBA*)last->core->board)->sio;
        if(fault&&!detached&&f>=100){
            GBASIOSetDriver(sio,NULL,SIO_MULTI);
            GBASIOLockstepDetachNode(&h.cable,&last->node);
            last->awake=1;
            detached=1;
        }
        if(detached&&!reconnected&&f>=280){
            memset(&last->node,0,sizeof(last->node));
            GBASIOLockstepNodeCreate(&last->node);
            GBASIOLockstepAttachNode(&h.cable,&last->node);
            GBASIOSetDriver(sio,&last->node.d,SIO_MULTI);
            last->awake=1;
            reconnected=1;
        }
        int all=1;
        for(int i=0;i<h.count;++i)if(!read_(&h.p[i],address+27*4))all=0;
        if(!phase&&all){
            phase=1;
            for(int i=0;i<h.count;++i)stable[i]=h.p[i].core->frameCounter(h.p[i].core);
        }
        if(phase==1){
            int idle=1;
            for(int i=0;i<h.count;++i)if(h.p[i].core->frameCounter(h.p[i].core)-stable[i]<120)idle=0;
            if(idle){
                phase=2;
                for(int i=0;i<h.count;++i){
                    closing[i]=h.p[i].core->frameCounter(h.p[i].core);
                    h.p[i].core->setKeys(h.p[i].core,512);
                }
            }
        }
        if(phase==2){
            int ended=1;
            for(int i=0;i<h.count;++i)if(h.p[i].core->frameCounter(h.p[i].core)-closing[i]<12)ended=0;
            if(ended)break;
        }
        int done=1,awake=0;
        for(int i=0;i<h.count;++i){
            struct Peer*p=&h.p[i];
            if(p->core->frameCounter(p->core)<frames)done=0;
            if(p->awake){
                awake=1;
                if(!schedule||i==iterations%h.count)p->core->runLoop(p->core);
            }
        }
        if(done)break;
        if(!awake){
            fprintf(stderr,"DEADLOCK\n");
            return 7;
        }
        if(++iterations>100000000){
            fprintf(stderr,"LOOP LIMIT\n");
            return 8;
        }
    }
    for(int i=0;i<h.count;++i){
        struct Peer*p=&h.p[i];
        printf("peer %d frame %u regs %04x %04x witness",i,p->core->frameCounter(p->core),p->core->busRead16(p->core,0x4000128),p->core->busRead16(p->core,0x4000202));
        for(int j=0;j<32;++j)printf(" %u",read_(p,address+j*4));
        puts("");
    }
    for(int i=h.count-1;i>=0;--i){
        GBASIOSetDriver(&((struct GBA*)h.p[i].core->board)->sio,NULL,SIO_MULTI);
        GBASIOLockstepDetachNode(&h.cable,&h.p[i].node);
        h.p[i].core->deinit(h.p[i].core);
    }
    mLockstepDeinit(&h.cable.d);
    return phase==2?0:9;
}
