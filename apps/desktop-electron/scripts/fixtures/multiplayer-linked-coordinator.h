#ifndef GBA_LINKED_QA_COORDINATOR_H
#define GBA_LINKED_QA_COORDINATOR_H
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

#endif
