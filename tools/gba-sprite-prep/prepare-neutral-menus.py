"""Prepare the approved neutral menu assets; originals and nearest reviews stay separate."""
from pathlib import Path
from PIL import Image, ImageDraw
import json, hashlib, subprocess, sys

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools/gba-sprite-prep/production/neutral-menus-v1-approved'
SOURCE = OUT / 'source-candidate'
ASSETS = ROOT / 'apps/desktop-electron/default-assets/templates/exemplo-gba/Assets'
for p in [OUT/'review', OUT/'prepared', OUT/'reports', ASSETS/'backgrounds', ASSETS/'sprites', ASSETS/'fonts']:
    p.mkdir(parents=True, exist_ok=True)

def element(name):
    im = Image.open(SOURCE/'elements'/f'{name}.png').convert('RGBA')
    # Histograms show solid interiors clustered at 245-254, with a 0-6 alpha halo.
    # Keep the silhouette and remove that halo before palette preparation.
    im.putalpha(im.getchannel('A').point(lambda a: 255 if a >= 128 else 0))
    return im

def plate(name, size):
    im = element(name)
    im = im.crop(im.getbbox())
    # Nine-slice preserves pixel corners; only the center and edge strips repeat.
    margin = min(4, im.width//3, im.height//3)
    result = Image.new('RGBA', size)
    if name in ['row-normal','inventory-slot']:
        ImageDraw.Draw(result).rectangle((margin,margin,size[0]-margin-1,size[1]-margin-1),fill=(216,192,144,255))
    sx=[0,margin,im.width-margin,im.width]; sy=[0,margin,im.height-margin,im.height]
    dx=[0,margin,size[0]-margin,size[0]]; dy=[0,margin,size[1]-margin,size[1]]
    for y in range(3):
        for x in range(3):
            patch=im.crop((sx[x],sy[y],sx[x+1],sy[y+1]))
            result.alpha_composite(patch.resize((dx[x+1]-dx[x],dy[y+1]-dy[y]),Image.Resampling.NEAREST),(dx[x],dy[y]))
    if name in ['row-normal','inventory-slot']:
        ImageDraw.Draw(result).rectangle((2,2,size[0]-3,size[1]-3),fill=(216,192,144,255))
    return result

names=['carregar_jogo','configuracoes','creditos','missoes','inventario','mapa_menu','salvar','menu_start']
manifest={'source':str(SOURCE),'approval':'User approved the eight compositions and requested implementation.', 'backgrounds':{},'sprites':{},'alphaPolicy':'128 after per-family histogram review; remove low-alpha halo, preserve solid 245-254 interiors; masked reviews retained.'}
for name in names:
    bg=Image.open(SOURCE/'reviews/09-background-neutro-240x160.png').convert('RGBA')
    bg.alpha_composite(plate('header',(192,24)),(24,8))
    if name=='inventario':
        for x,y in [(16,40),(56,40),(96,40),(16,80),(56,80),(96,80)]: bg.alpha_composite(plate('inventory-slot',(32,32)),(x,y))
        bg.alpha_composite(plate('detail-panel',(88,88)),(136,40))
    elif name=='mapa_menu':
        bg.alpha_composite(plate('detail-panel',(144,96)),(8,40))
        bg.alpha_composite(plate('detail-panel',(72,96)),(160,40))
        draw=ImageDraw.Draw(bg)
        route=[(32,56),(80,56),(128,56),(128,88),(80,88),(32,88),(32,120),(80,120)]
        for a,b in zip(route,route[1:]):
            length=max(abs(b[0]-a[0]),abs(b[1]-a[1]))
            for k in range(0,length,4):
                x=a[0]+(b[0]-a[0])*k//length;y=a[1]+(b[1]-a[1])*k//length
                draw.rectangle((x,y,x+1,y+1),fill=(120,96,56,255))
    elif name=='missoes':
        for y in [40,64,88,112]: bg.alpha_composite(plate('row-normal',(128,16)),(8,y))
        bg.alpha_composite(plate('detail-panel',(88,88)),(144,40))
    elif name=='menu_start':
        bg.alpha_composite(plate('detail-panel',(64,88)),(16,40))
        for y in [40,56,72,88,104,120]: bg.alpha_composite(plate('row-normal',(144,16)),(88,y))
    elif name in ['salvar','carregar_jogo']:
        for y in [32,64,96]: bg.alpha_composite(plate('row-normal',(208,24)),(16,y))
        bg.alpha_composite(plate('row-normal',(96,16)),(72,124))
    elif name=='configuracoes':
        for y in [40,56,72,88,104]: bg.alpha_composite(plate('row-normal',(208,16)),(16,y))
    elif name=='creditos': bg.alpha_composite(plate('detail-panel',(208,96)),(16,40))
    bg.alpha_composite(plate('row-normal',(224,16)),(8,140))
    if name=='inventario': bg.alpha_composite(plate('row-normal',(120,16)),(8,116))
    if name=='mapa_menu': bg.alpha_composite(plate('row-normal',(224,24)),(8,132))
    review=OUT/'review'/f'neutral-{name}.png'; bg.save(review)
    native=OUT/'prepared'/f'neutral-{name}-gba.png'; report=OUT/'reports'/f'{name}-background.json'
    subprocess.run(['python3',str(ROOT/'packages/GBAStudioEngine/tools/assetc/assetc.py'),str(review),'-o',str(native),'--prepare-background-4bpp','--background-palette-banks','12','--background-report',str(report)],check=True)
    (ASSETS/'backgrounds'/native.name).write_bytes(native.read_bytes())
    manifest['backgrounds'][name]={'file':native.name,'report':json.loads(report.read_text()),'sha256':hashlib.sha256(native.read_bytes()).hexdigest()}

ids=['item-estrutura','item-aderencia','item-celula','item-blindagem','item-impulso','portrait-male','portrait-female','marker-porto','marker-penedos','marker-armazem','marker-observatorio','marker-mercado','marker-usina','marker-conselho','marker-circuito','mission','bag','map','save','gear','return','selection-frame','arrow-right']
for id in ids + ['detail-'+n for n in ids[:5]] + ['portrait-small-male','portrait-small-female'] + ['compact-'+n for n in ids if n not in ['portrait-male','portrait-female','selection-frame','arrow-right']]:
    base=id.removeprefix('compact-').removeprefix('detail-').replace('portrait-small-', 'portrait-'); im=element(base)
    if id.startswith('compact-'): im=im.resize((16,16),Image.Resampling.NEAREST)
    if id.startswith('portrait-small-'):
        portrait=im.resize((24,24),Image.Resampling.NEAREST)
        im=Image.new('RGBA',(32,32)); im.alpha_composite(portrait,(4,0))
    if id.startswith('detail-'): im=im.resize((64,64),Image.Resampling.NEAREST)
    if id in ['portrait-male','portrait-female']:
        canvas=Image.new('RGBA',(64,64)); canvas.alpha_composite(im,(8,8)); im=canvas
    if im.size not in [(8,8),(16,16),(32,32),(64,64),(16,8),(32,8),(32,16),(64,32),(8,16),(8,32),(16,32),(32,64)]:
        canvas=Image.new('RGBA',(32,32));canvas.alpha_composite(im,((32-im.width)//2,(32-im.height)//2));im=canvas
    im.save(OUT/'review'/f'{id}-mask.png')
    if '--review-only' in sys.argv:
        continue
    visible=Image.new('RGB',(max(1,sum(a>=128 for a in im.getchannel('A').getdata())),1))
    visible.putdata([p[:3] for p in im.getdata() if p[3]>=128])
    colors=visible.quantize(colors=15,method=Image.Quantize.MEDIANCUT).getpalette()[:45]
    palette=[tuple((c>>3)<<3 for c in colors[i:i+3]) for i in range(0,len(colors),3)]
    out=Image.new('RGBA',im.size)
    out.putdata([(*min(palette,key=lambda c:sum((c[k]-p[k])**2 for k in range(3))),255) if p[3]>=128 else (0,0,0,0) for p in im.getdata()])
    file=f'neutral-{id}-gba.png'; out.save(OUT/'prepared'/file); out.save(ASSETS/'sprites'/file)
    manifest['sprites'][id]={'file':file,'width':out.width,'height':out.height,'visibleColors':len(set(p[:3] for p in out.getdata() if p[3])),'sha256':hashlib.sha256((OUT/'prepared'/file).read_bytes()).hexdigest()}

font=Image.open(ASSETS/'fonts/gba-dialogue-font-v3.png').convert('RGBA')
font.putdata([(32,24,24,255) if sum(p[:3]) > 300 else (0,0,0,0) for p in font.getdata()])
font.save(ASSETS/'fonts/neutral-menu-font-gba.png')
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'backgrounds':len(manifest['backgrounds']),'sprites':len(manifest['sprites'])}))
