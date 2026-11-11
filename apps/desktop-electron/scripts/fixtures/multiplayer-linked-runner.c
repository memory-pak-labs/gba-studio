/* MPL-2.0 coordinator; upstream attribution is in the shared header. */
#include "multiplayer-linked-coordinator.h"

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
