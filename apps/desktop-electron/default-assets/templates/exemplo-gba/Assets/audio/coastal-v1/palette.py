#!/usr/bin/env python3
"""Original procedural scores/samples for the approved coastal palette; no external audio."""
import hashlib
import json
import math
import random
import struct
import wave
from pathlib import Path

OUT = Path(__file__).resolve().parent
RATE, SOURCE_RATE = 31536, 8363
TAU = math.tau
ROOT_HZ = 261.6255653005986
INSTRUMENTS = [
    ('Flauta de brisa', 'flute', .55, 36, 30),
    ('Cordas de cais', 'pluck', .52, 38, 24),
    ('Baixo de madeira', 'bass', .15, 43, 36),
    ('Cordas de neblina', 'pad', 1.10, 27, 16),
    ('Vidro marinho', 'bell', .70, 34, 18),
    ('Bumbo de lona', 'kick', .22, 52, 26),
    ('Caixa de escova', 'brush', .20, 42, 14),
    ('Areia chocalho', 'shaker', .11, 35, 10),
    ('Pele de viagem', 'skin', .25, 43, 16),
]

def note(text):
    if isinstance(text, int): return text
    names = {'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
    return 12 * (int(text[-1]) + 1) + names[text[0]] + (1 if '#' in text else -1 if 'b' in text else 0)

def sine(hz, time): return math.sin(TAU * hz * time)

def synth(kind, duration, rate, peak, seed=0):
    rng, filtered = random.Random(7069 + seed), 0.
    values = []
    for i in range(round(duration * rate)):
        t = i / rate
        noise = rng.uniform(-1, 1)
        filtered += .34 * (noise - filtered)
        f = ROOT_HZ
        if kind == 'flute':
            vibrato = .0035 * math.sin(TAU * 4.5 * t) * (1-math.exp(-t*9))
            v = sine(f, t+vibrato*t*.12) + .13*sine(2*f,t) + .035*sine(3*f,t) + .04*filtered
            env = min(1,t/.028) * math.exp(-1.8*t)
        elif kind == 'pluck':
            v = sum(sine(f*k,t)*math.exp(-t*k*4)/k for k in range(1,7))
            env = min(1,t/.003)*math.exp(-5*t)
        elif kind == 'bass':
            v = sine(f,t)+.28*sine(2*f,t)+.07*sine(3*f,t)
            env = min(1,t/.004)*math.exp(-18*t)
        elif kind == 'pad':
            v = .68*sine(f,t)+.12*sine(2*f,t)+.045*sine(3*f,t)+.09*sine(f*1.002,t)
            env = min(1,t/.08)*math.exp(-1.9*t)
        elif kind == 'bell':
            v = sine(f,t)*math.exp(-t*4)+.32*sine(f*2.76,t)*math.exp(-t*8)+.13*sine(f*4.11,t)*math.exp(-t*14)
            env = min(1,t/.002)
        elif kind == 'kick':
            phase = 58*t + 72*.018*(1-math.exp(-t/.018))
            v = math.sin(TAU*phase) + .08*filtered*math.exp(-t*90)
            env = min(1,t/.001)*math.exp(-t*20)
        elif kind == 'brush':
            v = .8*filtered+.2*sine(176,t)
            env = min(1,t/.002)*math.exp(-t*23)
        elif kind == 'shaker':
            v = noise-filtered
            env = min(1,t/.003)*math.exp(-t*32)
        else:
            v = sine(132,t)+.4*sine(211,t)+.15*filtered
            env = min(1,t/.002)*math.exp(-t*15)
        # A short release guarantees zero-ended, reusable source samples.
        release = min(1, max(0, (duration-t) / min(.06,duration*.22)))
        values.append(v*env*release)
    norm = max(abs(x) for x in values) or 1
    return [max(-127,min(127,round(x/norm*peak))) for x in values]

def write_wav(path, values, rate=RATE):
    with wave.open(str(path),'wb') as file:
        file.setparams((1,2,rate,len(values),'NONE','not compressed'))
        file.writeframes(struct.pack('<'+'h'*len(values), *[max(-32768,min(32767,round(x))) for x in values]))

def write_module(name, channels, bars, chords, melody, mystery=False, row_frames=None, lead=1, driving=False):
    tempo = 90 if mystery else 112
    if row_frames is not None: tempo = round(900/row_frames)
    rows = bars*16
    score = [[None]*channels for _ in range(rows)]
    def put(row,ch,pitch,instrument,volume=None):
        if 0<=row<rows and ch<channels:
            score[row][ch]=(note(pitch),instrument,volume)
    for bar in range(bars):
        base=bar*16
        bass, tones = chords[bar % len(chords)]
        for pos in ([0,8] if mystery else [0,4,8,12]):
            put(base+pos,2,bass if pos!=8 else note(bass)+7,3)
        for ch,pitch in zip([3,4,5],tones[:3]):
            for pos in [0,8]:put(base+pos,ch,note(pitch)+12,4)
        for pos,pitch in melody[bar % len(melody)]:put(base+pos,0,pitch,lead)
        arp=[note(x)+12 for x in tones]
        for index,pos in enumerate([2,6,10,14]):
            put(base+pos,1,arp[(index+bar%2)%len(arp)],2)
        if mystery:
            if bar%2==0:put(base+12,6,note(tones[1])+24,5)
            for pos in [0,10]:put(base+pos,7,'C4',9,12)
        else:
            if bar%2==0:put(base+10,6,note(tones[1])+24,5)
            for pos in ([0,8,14] if bar%4==3 else [0,8]):put(base+pos,7,'C4',6)
            for pos in [4,12]:put(base+pos,8,'C4',7)
            for pos in range(0,16,2):put(base+pos,9,'C4',8,12 if pos%4==0 else 8)
            for pos in [6,14]:put(base+pos,10,'C4',9,12)
            if bar%4==3:put(base+14,11,note(tones[0])+24,5)
    if driving:
        for bar in range(bars):
            for pos in [2,6,10,14]:put(bar*16+pos,2,note(chords[bar % len(chords)][0])+12,3,27)
    data=bytearray(1084)
    data[:20]=name.encode('ascii')[:20].ljust(20,b'\0')
    samples=[]
    for idx,(label,kind,duration,peak,volume) in enumerate(INSTRUMENTS):
        values=synth(kind,duration,SOURCE_RATE,peak,idx)
        if len(values)%2:values.append(0)
        samples.append(values)
        off=20+idx*30
        data[off:off+22]=label.encode('ascii','replace')[:22].ljust(22,b'\0')
        struct.pack_into('>H',data,off+22,len(values)//2)
        data[off+25]=volume
        struct.pack_into('>HH',data,off+26,0,1)
    patterns=(rows+63)//64
    data[950]=patterns;data[952:952+patterns]=bytes(range(patterns));data[1080:1084]=(f'{channels}CH' if channels>=10 else f'{channels}CHN').encode()
    pattern_data=bytearray(patterns*64*channels*4)
    for row,cells in enumerate(score):
        for ch,event in enumerate(cells):
            effect,param=0,0
            if row==0 and ch==0:effect,param=15,6
            if row==0 and ch==1:effect,param=15,tempo
            pitch,inst,vol=event if event else (60,0,None)
            period=round(7093789/(2*SOURCE_RATE*2**((pitch-60)/12))) if event else 0
            if vol is not None:effect,param=12,vol
            offset=(row*channels+ch)*4
            pattern_data[offset:offset+4]=bytes([(inst&0xf0)|((period>>8)&15),period&255,((inst&15)<<4)|effect,param])
    data+=pattern_data
    for values in samples:data+=bytes(x&255 for x in values)
    path=OUT/'sources'/f'{name}.mod';path.write_bytes(data)
    return {'id':name,'source':str(path.relative_to(OUT)),'channels':channels,'bars':bars,'rows':rows,'tempo_bpm':tempo,'row_frames':round(900/tempo),'expected_seconds':rows*round(900/tempo)/59.7275,'loop':True,'instruments':[x[0] for x in INSTRUMENTS]}

def sfx(name,duration,layers,noise=0):
    rng=random.Random(7069); values=[]; filtered=0
    for i in range(round(duration*RATE)):
        t=i/RATE;value=0
        for hz,start,length,gain,bend,kind in layers:
            local=t-start
            if not 0<=local<length:continue
            phase=hz*local+.5*bend*local*local
            voice=math.sin(TAU*phase)
            if kind=='bell':voice+=.23*math.sin(TAU*phase*2.76)*math.exp(-local*14)
            if kind=='wood':voice+=.28*math.sin(TAU*phase*1.63)*math.exp(-local*38)
            env=min(1,local/.003)*math.exp(-local*(5/length))*min(1,(length-local)/.015)
            value+=voice*env*gain
        n=rng.uniform(-1,1);filtered+=.17*(n-filtered)
        value+=filtered*noise*math.exp(-t*14)*min(1,t/.002)
        values.append(value*10500)
    path=OUT/'sources'/f'{name}.wav';write_wav(path,values)
    return {'id':name,'source':str(path.relative_to(OUT)),'duration':duration,'rate':RATE,'peak_dbfs':20*math.log10(max(abs(x) for x in values)/32768)}
