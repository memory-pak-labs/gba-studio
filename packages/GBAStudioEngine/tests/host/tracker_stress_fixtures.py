#!/usr/bin/env python3
"""Generate deterministic QA music; PCM is synthesized here, with no imported assets.

python3 tests/host/tracker_stress_fixtures.py /tmp/owned-fixtures --pitch-channels 4
Use --pitch-channels 16 to require continuous pitch effects on every voice.
"""
import sys,struct,pathlib
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from assetc_extended_tracker_tests import xm_fixture
import argparse,math
parser=argparse.ArgumentParser(description='Authored 16-voice XM/IT CPU fixtures; no external assets.')
parser.add_argument('output',type=pathlib.Path);parser.add_argument('--pitch-channels',type=int,choices=range(17),default=4)
args=parser.parse_args();root=args.output;root.mkdir(parents=True,exist_ok=True);rows=192
waveforms=[[round(80*math.sin(i*math.pi/16+phase)) for i in range(128)] for phase in [0,0.4,0.8,1.2]]
# Four separately authored samples and sixteen distinct pitches.
notes=[37,41,44,49,53,56,61,65,38,42,45,50,54,57,62,67]
sample_map=[n%4 for n in range(96)]
for load in ['static','effects']:
 b,ins,_=xm_fixture(channels=16,rows=rows);b=b[:ins+263]+bytearray(4*40+4*128);struct.pack_into('<H',b,ins+27,4);b[ins+33:ins+129]=bytes(sample_map);b[345:ins]=bytes(ins-345)
 for sample,pcm in enumerate(waveforms):
  at=ins+263+sample*40;struct.pack_into('<III',b,at,128,0,128);b[at+12],b[at+14],b[at+15]=64,1,128
  previous=0
  for i,value in enumerate(pcm):b[ins+263+160+sample*128+i]=(value-previous)&255;previous=value
 for ch in range(16):
  note=notes[ch]
  for row in range(rows):
   fx=p=0;n=note if row==0 else 0;i=1 if row==0 else 0;vol=0x16 if row==0 else 0
   if load=='effects' and ch<args.pitch_channels:
    if ch%4==0:fx=4;p=0x47
    elif ch%4==1:fx=0;p=0x37
    elif ch%4==2:fx=1 if row%8<4 else 2;p=2
    else:fx=3;p=8;n=note+(4 if row%8<4 else 0)
   at=345+(row*16+ch)*5;b[at:at+5]=bytes([n,i,vol,fx,p])
 if load=='effects':
  for pts,off,cnt,flg,ls,le in [([(0,32),(4,64),(12,24),(24,48)],129,225,233,228,229), ([(0,24),(16,40),(32,24)],177,226,234,231,232)]:
   b[ins+cnt]=len(pts);b[ins+flg]=5;b[ins+ls]=1 if off==129 else 0;b[ins+le]=len(pts)-1
   for j,p in enumerate(pts):struct.pack_into('<HH',b,ins+off+j*4,*p)
 (root/f'load-{load}.xm').write_bytes(b)
print('authored sources',[(p.name,p.stat().st_size) for p in root.glob('load-*.xm')])
from assetc_tracker_replay_tests import it_song
# Reuse the authored XM cells, translating command IDs rather than rendering PCM.
xm=(root/'load-effects.xm').read_bytes();packed=bytearray()
for row in range(rows):
 for ch in range(16):
  at=345+(row*16+ch)*5;n,i,v,fx,p=xm[at:at+5]
  cmd={0:10 if p else 0,1:6,2:5,3:7,4:8}[fx]
  mask=(1 if n else 0)|(2 if i else 0)|(4 if v else 0)|(8 if cmd or p else 0)
  packed.extend([129+ch,mask])
  if n:packed.append(n+11)
  if i:packed.append(i)
  if v:packed.append(v-16)
  if cmd or p:packed.extend([cmd,p])
 packed.append(0)
base=it_song({0:[60,1,None,0,0]},rows=rows,volume_env={'points':[(0,32),(4,64),(12,24),(24,48)],'loop':(1,3)},pan_env={'points':[(0,-8),(16,8),(32,-8)],'loop':(0,2)},pitch_env=None)
oldins=struct.unpack_from('<I',base,193)[0];instrument=bytearray(base[oldins:oldins+554]);header=base[:192]+bytearray(1+6*4)
struct.pack_into('<H',header,36,4);sample_offsets=[224+i*80 for i in range(4)];pattern=544
b=header+bytearray(pattern-len(header))+struct.pack('<HHI',len(packed),rows,0)+packed
for j,pcm in enumerate(waveforms):
 sample=sample_offsets[j];source=208;b[sample:sample+80]=base[source:source+80];struct.pack_into('<I',b,sample+72,len(b));b+=bytes(x&255 for x in pcm)
for note in range(120):instrument[65+note*2]=sample_map[max(0,min(95,note-12))]+1
ins=len(b);b+=instrument
struct.pack_into('<IIIIII',b,193,ins,*sample_offsets,pattern)
for ch in range(16):b[64+ch]=32
(root/'load-effects.it').write_bytes(b)
