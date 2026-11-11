/* MPL-2.0 coordinator and unmodified native mGBA execution. See shared header. */
#include "multiplayer-linked-coordinator.h"
#include <mgba/core/blip_buf.h>

struct Measurement {
    unsigned video, game, simulation, windows, previous_video, audio_frames, samples, peak;
    uint32_t audio_hash;
    color_t* pixels;
    FILE* pcm;
};

int main(int argc,char**argv) {
    if(argc!=6&&argc!=8)return 2;
    const int controls=argc==8;
    const uint32_t history=controls?strtoul(argv[6],0,16):0;
    const unsigned command_count=controls?atoi(argv[7]):0;
    struct mLogger logger={.log=quiet};mLogSetDefaultLogger(&logger);
    struct Host h={0};struct Measurement m[4]={0};
    h.count=atoi(argv[1]);
    if(h.count!=1&&h.count!=2&&h.count!=4)return 2;
    const uint32_t address=strtoul(argv[3],0,16);
    const unsigned limit=atoi(argv[4]);
    mLockstepInit(&h.cable.d);GBASIOLockstepInit(&h.cable);h.cable.d.context=&h;
    h.cable.d.signal=signal_;h.cable.d.wait=wait_;h.cable.d.addCycles=add_;
    h.cable.d.useCycles=use_;h.cable.d.unusedCycles=unused_;h.cable.d.unload=unload_;
    for(int i=0;i<h.count;++i) {
        struct Peer*p=&h.p[i];p->awake=1;p->core=GBACoreCreate();
        if(!p->core->init(p->core))return 3;
        mCoreConfigInit(&p->core->config,NULL);mCoreConfigSetDefaultIntValue(&p->core->config,"skipBios",1);
        mCoreConfigSetDefaultIntValue(&p->core->config,"volume",0x100);
        mCoreConfigSetDefaultIntValue(&p->core->config,"mute",0);
        mCoreConfigSetDefaultIntValue(&p->core->config,"frameskip",0);
        mCoreLoadConfig(p->core);
        m[i].pixels=calloc(240*160,sizeof(color_t));m[i].audio_hash=2166136261u;
        p->core->setVideoBuffer(p->core,m[i].pixels,240);
        p->core->setAudioBufferSize(p->core,4096);
        if(!p->core->loadROM(p->core,VFileOpen(argv[2],O_RDONLY)))return 4;
        p->core->reset(p->core);
        for(int ch=0;ch<2;++ch)blip_set_rates(p->core->getAudioChannel(p->core,ch),p->core->frequency(p->core),44100);
        if(h.count>1) {
            GBASIOLockstepNodeCreate(&p->node);
            if(!GBASIOLockstepAttachNode(&h.cable,&p->node))return 5;
            GBASIOSetDriver(&((struct GBA*)p->core->board)->sio,&p->node.d,SIO_MULTI);
        }
    }
    char filename[4096];snprintf(filename,sizeof(filename),"%s.pcm",argv[5]);
    m[0].pcm=fopen(filename,"wb");if(!m[0].pcm)return 6;
    unsigned closing[4]={0};int phase=0;unsigned long iterations=0;
    unsigned started[4][12]={{0}},ended[4][12]={{0}},key_video[4][12]={{0}};
    for(;;) {
        int all_windows=1,all_delivered=1,all_closed=1,awake=0;
        for(int i=0;i<h.count;++i) {
            struct Peer*p=&h.p[i];struct Measurement*s=&m[i];
            const unsigned video=p->core->frameCounter(p->core),game=read_(p,address+4);
            if(controls&&!phase&&game>=240) {
                const unsigned seq=read_(p,address+22*4),kind=read_(p,address+20*4);
                const unsigned td[]={16,32,128,64,272,288},plat[]={16,32,1,0,17,32},iso[]={16,32,128,64,144,96};
                const unsigned mask=kind==1?plat[seq%6]:kind==2?iso[seq%6]:td[seq%6];
                p->core->setKeys(p->core,seq<command_count&&i==seq%h.count?mask:(mask==16?32:16));
                if(seq<command_count&&i==seq%h.count&&!key_video[i][seq])key_video[i][seq]=video;
                for(unsigned seq=0;seq<command_count;++seq) {
                    const uint32_t at=history+seq*18*4;
                    if(!started[i][seq]&&read_(p,at+4*4))started[i][seq]=video;
                    if(!ended[i][seq]&&read_(p,at+15*4)) {
                        ended[i][seq]=video;
                        printf("{\"type\":\"control\",\"peer\":%d,\"seq\":%u,\"keyVideo\":%u,\"startVideo\":%u,\"endVideo\":%u,\"history\":[",i,seq,key_video[i][seq],started[i][seq],video);
                        for(unsigned n=0;n<18;++n)printf("%s%d",n?",":"",(int32_t)read_(p,at+n*4));
                        puts("]}");fflush(stdout);
                    }
                }
            }
            if(!s->video&&game>=240) {s->video=s->previous_video=video;s->game=game;s->simulation=read_(p,address+39*4);}
            if(video!=s->previous_video) {
                short l[2048],r[2048];
                struct blip_t*left=p->core->getAudioChannel(p->core,0),*right=p->core->getAudioChannel(p->core,1);
                int count;
                while((count=blip_samples_avail(left))>0) {
                    if(count>2048)count=2048;if(blip_samples_avail(right)<count)count=blip_samples_avail(right);
                    if(!count)break;
                    blip_read_samples(left,l,count,0);blip_read_samples(right,r,count,0);
                    if(s->video&&s->windows<3)for(int n=0;n<count;++n) {
                        const short sample[2]={l[n],r[n]};
                        for(int ch=0;ch<2;++ch) {
                            unsigned value=abs(sample[ch]);if(value>s->peak)s->peak=value;
                            s->audio_hash=(s->audio_hash^(uint16_t)sample[ch])*16777619u;
                        }
                        ++s->samples;
                        if(s->pcm&&s->windows==0)fwrite(sample,sizeof(short),2,s->pcm);
                    }
                }
                s->previous_video=video;
            }
            if(s->video&&s->windows<3&&video-s->video>=240) {
                printf("{\"type\":\"window\",\"peer\":%d,\"window\":%u,\"videoFrames\":%u,\"gameFrames\":%u,\"simulationFrames\":%u,\"voices\":%u,\"underruns\":%u,\"scene\":%u,\"runtime\":%u,\"pending\":%u}\n",
                    i,s->windows,video-s->video,game-s->game,read_(p,address+39*4)-s->simulation,read_(p,address+15*4),read_(p,address+17*4),read_(p,address+21*4),read_(p,address+20*4),read_(p,address+6*4));
                fflush(stdout);++s->windows;s->video=video;s->game=game;s->simulation=read_(p,address+39*4);
                if(s->windows==3) {
                    snprintf(filename,sizeof(filename),"%s-%d.rgba",argv[5],i);
                    FILE*f=fopen(filename,"wb");if(!f)return 6;
                    for(int pixel=0;pixel<240*160;++pixel) {
                        const uint32_t color=m[i].pixels[pixel];
                        const unsigned char rgba[4]={color&255,(color>>8)&255,(color>>16)&255,255};
                        fwrite(rgba,1,4,f);
                    }
                    fclose(f);
                }
            }
            if(s->windows<3)all_windows=0;
            if(!read_(p,address+30*4))all_delivered=0;
            if(controls&&(!ended[i][command_count-1]))all_delivered=0;
            if(phase&&video-closing[i]<12)all_closed=0;
            if(video>=limit) {
                uint32_t pc=0,sp=0,lr=0;
                p->core->readRegister(p->core,"pc",&pc);p->core->readRegister(p->core,"sp",&sp);p->core->readRegister(p->core,"lr",&lr);
                fprintf(stderr,"FRAME LIMIT peer %d video %u game %u pc %08x sp %08x lr %08x witness",i,video,game,pc,sp,lr);
                for(int word=0;word<40;++word)fprintf(stderr," %u",read_(p,address+word*4));
                fputc('\n',stderr);return 9;
            }
        }
        if(!phase&&all_windows&&all_delivered) {
            phase=1;
            for(int i=0;i<h.count;++i) {closing[i]=h.p[i].core->frameCounter(h.p[i].core);h.p[i].core->setKeys(h.p[i].core,512);}
        } else if(phase&&all_closed)break;
        for(int i=0;i<h.count;++i)if(h.p[i].awake) {awake=1;h.p[i].core->runLoop(h.p[i].core);}
        if(!awake) {fprintf(stderr,"DEADLOCK\n");return 7;}
        if(++iterations>100000000) {
            for(int i=0;i<h.count;++i) {
                uint32_t pc=0;h.p[i].core->readRegister(h.p[i].core,"pc",&pc);
                fprintf(stderr,"LOOP LIMIT peer %d video %u game %u pc %08x\n",i,h.p[i].core->frameCounter(h.p[i].core),read_(&h.p[i],address+4),pc);
            }
            return 8;
        }
    }
    for(int i=0;i<h.count;++i) {
        struct Peer*p=&h.p[i];struct Measurement*s=&m[i];
        if(s->pcm)fclose(s->pcm);
        printf("{\"type\":\"peer\",\"peer\":%d,\"videoFrames\":%u,\"peak\":%u,\"samples\":%u,\"pcmHash\":%u,\"witness\":[",i,p->core->frameCounter(p->core),s->peak,s->samples,s->audio_hash);
        for(int word=0;word<40;++word)printf("%s%u",word?",":"",read_(p,address+word*4));
        puts("]}");
    }
    for(int i=h.count-1;i>=0;--i) {
        if(h.count>1) {
            GBASIOSetDriver(&((struct GBA*)h.p[i].core->board)->sio,NULL,SIO_MULTI);
            GBASIOLockstepDetachNode(&h.cable,&h.p[i].node);
        }
        h.p[i].core->deinit(h.p[i].core);free(m[i].pixels);
    }
    mLockstepDeinit(&h.cable.d);return 0;
}
